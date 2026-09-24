#!/usr/bin/env python3
# Test fixture ONLY (never bundled). Emits a deterministic transcript in the
# sidecar JSON contract so the pipeline's spawn/parse/store logic can be tested
# without faster-whisper. Mirrors the real sidecar's stdout shape.
import argparse, json

ap = argparse.ArgumentParser()
ap.add_argument("--audio", required=True)
ap.add_argument("--model", default="small")
ap.add_argument("--language", default="en")
ap.add_argument("--diarize", action="store_true")
# Same flags the real sidecar accepts (ignored here) — loopback mode passes
# --stereo-speakers, and argparse would otherwise exit 2 on an unknown flag.
ap.add_argument("--stereo-speakers", action="store_true")
ap.add_argument("--left-label", default="You (operator)")
ap.add_argument("--right-label", default="Seller")
ap.parse_args()

text = "This is a stub transcript used to verify the processing pipeline."
print(
    json.dumps(
        {
            "text": text,
            "segments": [{"speaker": "", "text": text, "start_ms": 0, "end_ms": 1500}],
            "speaker_labeled": False,
            "engine": "local-whisper",
        }
    )
)
