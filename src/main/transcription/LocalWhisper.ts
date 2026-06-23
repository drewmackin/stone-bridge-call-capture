// =============================================================================
// LocalWhisper — the default, privacy-preserving transcriber. Audio NEVER
// leaves the machine. It spawns a bundled faster-whisper sidecar (built with
// PyInstaller; see resources/whisper-sidecar/transcribe.py + scripts/
// build-sidecar.sh) and reads a single JSON object from stdout. Speaker labels
// (diarization) are best-effort: present only if a Hugging Face token is
// configured and pyannote is available — otherwise the full transcript is still
// returned, unlabeled. The Hugging Face token is passed via the child ENV, never
// argv, so it can't leak into the process table.
// =============================================================================

import { execFile } from 'child_process'
import { existsSync } from 'fs'
import type { TranscriptionResult } from '@shared/types'
import { getConfig, hasSecret } from '../config'
import { sidecarPath } from '../readiness'
import { type Transcriber, type TranscribeOptions, TranscriptionError } from './Transcriber'

interface SidecarOutput {
  text: string
  segments?: { speaker?: string; text: string; start_ms?: number; end_ms?: number }[]
  speaker_labeled?: boolean
  error?: string
}

/** Resolve how to launch the sidecar (built binary, or a python script in dev/test). */
function invocation(): { cmd: string; baseArgs: string[] } {
  const script = process.env.STONE_WHISPER_SCRIPT
  if (script) {
    return { cmd: process.env.STONE_WHISPER_PYTHON || 'python3', baseArgs: [script] }
  }
  return { cmd: sidecarPath(), baseArgs: [] }
}

export class LocalWhisperTranscriber implements Transcriber {
  readonly engine = 'local-whisper' as const

  isAvailable(): { ok: boolean; reason: string } {
    if (process.env.STONE_WHISPER_SCRIPT) {
      return { ok: true, reason: 'Using dev/test transcription script.' }
    }
    const path = sidecarPath()
    return existsSync(path)
      ? { ok: true, reason: 'Local Whisper sidecar found.' }
      : {
          ok: false,
          reason:
            'Local Whisper sidecar is not built yet. Build it with scripts/build-sidecar.sh (see SETUP.md). Your audio is saved and can be transcribed after the sidecar is built.'
        }
  }

  transcribe({ audioPath }: TranscribeOptions): Promise<TranscriptionResult> {
    const cfg = getConfig()
    const avail = this.isAvailable()
    if (!avail.ok) return Promise.reject(new TranscriptionError(avail.reason, true))
    if (!existsSync(audioPath)) {
      return Promise.reject(new TranscriptionError(`Audio file not found: ${audioPath}`, false))
    }

    const { cmd, baseArgs } = invocation()
    const diarize = hasSecret(cfg.huggingFaceToken)
    const args = [
      ...baseArgs,
      '--audio',
      audioPath,
      '--model',
      cfg.whisperModel,
      '--language',
      'en'
    ]
    // Two-channel capture (a call-recording adapter / VoIP routed as you-left,
    // seller-right) gives deterministic per-speaker labels with no diarization.
    if (cfg.audioMode === 'loopback') args.push('--stereo-speakers')
    // Mono fallback: best-effort diarization when a Hugging Face token is set.
    if (diarize) args.push('--diarize')

    const childEnv = { ...process.env }
    if (diarize) childEnv.HUGGINGFACE_TOKEN = cfg.huggingFaceToken

    return new Promise<TranscriptionResult>((resolve, reject) => {
      execFile(
        cmd,
        args,
        {
          env: childEnv,
          timeout: 20 * 60 * 1000,
          maxBuffer: 64 * 1024 * 1024,
          // The ML sidecar may ignore SIGTERM mid-inference; force-kill so a
          // timeout/overflow can't leave an orphaned process holding CPU/RAM.
          killSignal: 'SIGKILL'
        },
        (err, stdout, stderr) => {
          if (err) {
            const tail = (stderr || err.message || '').toString().trim().slice(-500)
            const timedOut = (err as NodeJS.ErrnoException & { killed?: boolean }).killed
            return reject(
              new TranscriptionError(
                timedOut
                  ? 'Transcription timed out. Your audio is saved — try again or use a smaller model.'
                  : `Transcription failed: ${tail || 'sidecar error'}`,
                true
              )
            )
          }
          let parsed: SidecarOutput
          try {
            parsed = JSON.parse(stdout.toString().trim())
          } catch {
            return reject(
              new TranscriptionError(
                'Transcription produced unreadable output. Your audio is saved; please retry.',
                true
              )
            )
          }
          if (parsed.error) return reject(new TranscriptionError(parsed.error, true))

          const segments = (parsed.segments || []).map((s) => ({
            speaker: s.speaker || '',
            text: s.text,
            start_ms: s.start_ms ?? 0,
            end_ms: s.end_ms ?? 0
          }))
          resolve({
            text: parsed.text || '',
            segments,
            speaker_labeled: !!parsed.speaker_labeled,
            engine: 'local-whisper',
            entities: []
          })
        }
      )
    })
  }
}
