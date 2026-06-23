#!/usr/bin/env python3
"""
Stone Bridge local transcription sidecar.

Runs entirely on the operator's machine (audio never leaves the laptop). It
transcribes a recorded call with faster-whisper and attributes speech to a
speaker by one of two paths:

  1. TWO-CHANNEL (best, no AI guessing) — when the recording has 2 channels
     (e.g. a call-recording adapter or VoIP routed so YOU are on the left and
     the SELLER is on the right) and --stereo-speakers is set, each channel is
     transcribed independently and labeled deterministically. Separation is
     essentially perfect because the two voices were never mixed.

  2. SINGLE-CHANNEL DIARIZATION (fallback) — for a mono speakerphone recording,
     if a Hugging Face token is present AND pyannote is installed, best-effort
     speaker labels are added with a 2-speaker prior (num_speakers=2), which the
     research shows removes the largest diarization error source. Without the
     token/pyannote, the full transcript is still produced, just unlabeled.

It always emits a single JSON object on stdout:

  {
    "text": "<full transcript, time-ordered>",
    "segments": [
      {"speaker": "You (operator)" | "Seller" | "Speaker 1" | "", "text": "...",
       "start_ms": 0, "end_ms": 1200}
    ],
    "speaker_labeled": true | false,
    "engine": "local-whisper"
  }

On a fatal error it prints {"error": "..."} on stdout and exits non-zero.
faster-whisper resamples each input to 16 kHz mono internally, so no external
ffmpeg step is required (we hand it file paths, including per-channel temp WAVs).
"""

import argparse
import json
import multiprocessing
import os
import sys
import tempfile
import wave
import warnings


def eprint(*args):
    print(*args, file=sys.stderr, flush=True)


def read_stereo_channels(path):
    """If the WAV is 16-bit stereo, return (framerate, sampwidth, [left_bytes,
    right_bytes]) as deinterleaved mono frames; otherwise None (use mono path)."""
    try:
        with wave.open(path, "rb") as w:
            if w.getnchannels() != 2 or w.getsampwidth() != 2:
                return None
            framerate = w.getframerate()
            sampwidth = w.getsampwidth()
            raw = w.readframes(w.getnframes())
    except Exception as e:
        eprint(f"[stereo] could not read channels, falling back to mono: {e}")
        return None
    try:
        import numpy as np  # bundled (faster-whisper dependency)

        interleaved = np.frombuffer(raw, dtype=np.int16)
        # Guard against an odd-length buffer (truncated frame).
        usable = (interleaved.size // 2) * 2
        stereo = interleaved[:usable].reshape(-1, 2)
        left = stereo[:, 0].tobytes()
        right = stereo[:, 1].tobytes()
        return framerate, sampwidth, [left, right]
    except Exception as e:
        eprint(f"[stereo] deinterleave failed, falling back to mono: {e}")
        return None


def write_mono(path, frame_bytes, framerate, sampwidth):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(sampwidth)
        w.setframerate(framerate)
        w.writeframes(frame_bytes)


def transcribe_path(model, path, language):
    """Run faster-whisper on a file path; returns a list of segments."""
    segments_iter, _info = model.transcribe(path, language=language, vad_filter=True)
    return list(segments_iter)


def diarize(audio_path, hf_token):
    """Return a list of (start_s, end_s, speaker_label) or None if unavailable.
    Uses a 2-speaker prior — a seller call has exactly two parties — which the
    research identifies as the single biggest accuracy lever for pyannote."""
    try:
        from pyannote.audio import Pipeline  # type: ignore
    except Exception as e:  # pyannote not installed
        eprint(f"[diarize] pyannote unavailable, skipping speaker labels: {e}")
        return None
    try:
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1", use_auth_token=hf_token
        )
        annotation = pipeline(audio_path, num_speakers=2)
        turns = []
        for turn, _, speaker in annotation.itertracks(yield_label=True):
            turns.append((turn.start, turn.end, speaker))
        return turns
    except Exception as e:
        eprint(f"[diarize] diarization failed, continuing without labels: {e}")
        return None


def speaker_for(turns, start_s, end_s):
    """Pick the diarization speaker with the most overlap for a whisper segment."""
    if not turns:
        return ""
    best, best_overlap = "", 0.0
    for ts, te, spk in turns:
        overlap = max(0.0, min(end_s, te) - max(start_s, ts))
        if overlap > best_overlap:
            best, best_overlap = spk, overlap
    if best.startswith("SPEAKER_"):
        try:
            return f"Speaker {int(best.split('_')[1]) + 1}"
        except Exception:
            return best
    return best or ""


def transcribe_stereo(model, audio_path, language, left_label, right_label):
    """Per-channel transcription: each side is transcribed and labeled by which
    channel it came from. Returns (out_segments, True) on success, else None."""
    channels = read_stereo_channels(audio_path)
    if not channels:
        return None
    framerate, sampwidth, sides = channels
    labels = [left_label, right_label]
    out_segments = []
    tmp_paths = []
    try:
        for idx, frame_bytes in enumerate(sides):
            tf = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tf.close()
            tmp_paths.append(tf.name)
            write_mono(tf.name, frame_bytes, framerate, sampwidth)
            for s in transcribe_path(model, tf.name, language):
                text = s.text.strip()
                if not text:
                    continue
                out_segments.append(
                    {
                        "speaker": labels[idx],
                        "text": text,
                        "start_ms": int(s.start * 1000),
                        "end_ms": int(s.end * 1000),
                    }
                )
    finally:
        for p in tmp_paths:
            try:
                os.remove(p)
            except Exception:
                pass
    # Interleave the two sides into a single time-ordered conversation.
    out_segments.sort(key=lambda x: x["start_ms"])
    return out_segments, True


def main():
    # Benign numpy mel-filterbank warnings from faster-whisper's feature
    # extractor pollute stderr without affecting the transcript — silence them.
    warnings.filterwarnings("ignore", category=RuntimeWarning)

    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--model", default="small")
    ap.add_argument("--language", default="en")
    ap.add_argument("--diarize", action="store_true")
    ap.add_argument(
        "--stereo-speakers",
        action="store_true",
        help="If the recording has 2 channels, transcribe each separately and label by channel.",
    )
    ap.add_argument("--left-label", default="You (operator)")
    ap.add_argument("--right-label", default="Seller")
    args = ap.parse_args()

    if not os.path.exists(args.audio):
        print(json.dumps({"error": f"audio file not found: {args.audio}"}))
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception as e:
        print(json.dumps({"error": f"faster-whisper not installed: {e}"}))
        sys.exit(1)

    # int8 on CPU is the best portable choice on Apple Silicon / Windows.
    try:
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
    except Exception as e:
        print(json.dumps({"error": f"failed to load model '{args.model}': {e}"}))
        sys.exit(1)

    out_segments = None
    speaker_labeled = False

    # --- Path 1: two-channel deterministic separation (best). ---
    if args.stereo_speakers:
        try:
            stereo = transcribe_stereo(
                model, args.audio, args.language, args.left_label, args.right_label
            )
            if stereo:
                out_segments, speaker_labeled = stereo
        except Exception as e:
            eprint(f"[stereo] per-channel transcription failed, falling back to mono: {e}")
            out_segments = None

    # --- Path 2: single mixed channel (+ optional diarization). ---
    if out_segments is None:
        try:
            segments = transcribe_path(model, args.audio, args.language)
        except Exception as e:
            print(json.dumps({"error": f"transcription failed: {e}"}))
            sys.exit(1)

        turns = None
        if args.diarize:
            hf = os.environ.get("HUGGINGFACE_TOKEN", "").strip()
            if hf:
                turns = diarize(args.audio, hf)
            else:
                eprint("[diarize] --diarize set but HUGGINGFACE_TOKEN missing; skipping")

        out_segments = []
        for s in segments:
            text = s.text.strip()
            out_segments.append(
                {
                    "speaker": speaker_for(turns, s.start, s.end) if turns else "",
                    "text": text,
                    "start_ms": int(s.start * 1000),
                    "end_ms": int(s.end * 1000),
                }
            )
        speaker_labeled = turns is not None

    full_text = " ".join(seg["text"] for seg in out_segments if seg["text"]).strip()
    print(
        json.dumps(
            {
                "text": full_text,
                "segments": out_segments,
                "speaker_labeled": speaker_labeled,
                "engine": "local-whisper",
            }
        )
    )


if __name__ == "__main__":
    # Required for PyInstaller-frozen binaries: intercept multiprocessing child
    # re-spawns (e.g. from onnxruntime/ctranslate2) so they don't re-run main()
    # and hit argparse. Without this, each call leaks an erroring child process.
    multiprocessing.freeze_support()
    main()
