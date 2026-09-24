// =============================================================================
// LocalWhisper — the default, privacy-preserving transcriber. Audio NEVER
// leaves the machine. It spawns a bundled faster-whisper sidecar (built with
// PyInstaller; see resources/whisper-sidecar/transcribe.py + scripts/
// build-sidecar.sh) and reads a single JSON object from stdout. Speaker labels
// (diarization) are best-effort: present only if a Hugging Face token is
// configured and pyannote is available — otherwise the full transcript is still
// returned, unlabeled. The Hugging Face token is passed via the child ENV, never
// argv, so it can't leak into the process table — and the child gets a MINIMAL
// env, so the app's own API keys (Anthropic, AssemblyAI, Google) never reach it.
// =============================================================================

import { execFile, type ChildProcess } from 'child_process'
import { closeSync, existsSync, openSync, readSync, statSync } from 'fs'
import type { TranscriptionResult } from '@shared/types'
import { parseWavHeader } from '@shared/wav'
import { getConfig, hasSecret } from '../config'
import { sidecarPath } from '../readiness'
import { type Transcriber, type TranscribeOptions, TranscriptionError } from './Transcriber'

interface SidecarOutput {
  text: string
  segments?: { speaker?: string; text: string; start_ms?: number; end_ms?: number }[]
  speaker_labeled?: boolean
  error?: string
}

/** Live sidecar processes, so quitting the app can't orphan a mid-inference one. */
const running = new Set<ChildProcess>()

/** SIGKILL every running sidecar (called on app quit). */
export function killAllTranscribers(): void {
  for (const child of running) {
    try {
      child.kill('SIGKILL')
    } catch {
      /* already gone */
    }
  }
  running.clear()
}

const MIN_TIMEOUT_MS = 20 * 60 * 1000

/**
 * Scale the timeout with the recording: max(20 min, duration × channels × 3).
 * Stereo is transcribed per channel, and CPU inference on a long call can take
 * longer than real time. Falls back to the file size if the header's data size
 * is unset (e.g. a WAV finalized by a crash-recovery path).
 */
export function timeoutForWav(audioPath: string): number {
  try {
    const fd = openSync(audioPath, 'r')
    const buf = Buffer.alloc(44)
    try {
      readSync(fd, buf, 0, 44, 0)
    } finally {
      closeSync(fd)
    }
    const h = parseWavHeader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + 44))
    if (!h.valid || !h.sampleRate || !h.channels || !h.bitsPerSample) return MIN_TIMEOUT_MS
    const bytesPerSec = (h.sampleRate * h.channels * h.bitsPerSample) / 8
    const fileData = Math.max(0, statSync(audioPath).size - 44)
    const dataBytes = h.dataBytes > 0 && h.dataBytes <= fileData ? h.dataBytes : fileData
    const durationSec = dataBytes / bytesPerSec
    return Math.max(MIN_TIMEOUT_MS, Math.ceil(durationSec * h.channels * 3 * 1000))
  } catch {
    return MIN_TIMEOUT_MS
  }
}

/** Only what the sidecar (Python + faster-whisper + huggingface_hub) needs. */
const ENV_KEYS = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'XDG_CACHE_HOME', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE',
  // first-run model download behind a proxy
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  'OMP_NUM_THREADS'
]
// Windows: Python and its DLLs won't start without these (SystemRoot above all).
const WIN_ENV_KEYS = [
  'SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'PATHEXT', 'COMSPEC', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'HOMEDRIVE', 'HOMEPATH',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'USERNAME'
]
// HF_HOME / HF_HUB_CACHE / HF_HUB_OFFLINE / HF_TOKEN…, CTranslate2 tuning.
const ENV_PREFIXES = ['HF_', 'HUGGINGFACE_', 'CT2_']

function sidecarEnv(hfToken: string): NodeJS.ProcessEnv {
  // Windows env names are case-insensitive and PATH is usually spelled "Path",
  // so compare upper-cased there; POSIX names are exact.
  const win = process.platform === 'win32'
  const allowed = new Set(win ? [...ENV_KEYS, ...WIN_ENV_KEYS].map((k) => k.toUpperCase()) : ENV_KEYS)
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    const key = win ? k.toUpperCase() : k
    if (v !== undefined && (allowed.has(key) || ENV_PREFIXES.some((p) => key.startsWith(p)))) env[k] = v
  }
  // Dev/test: a python script run from a venv may rely on PYTHONPATH.
  if (process.env.STONE_WHISPER_SCRIPT && process.env.PYTHONPATH) env.PYTHONPATH = process.env.PYTHONPATH
  if (hfToken) env.HUGGINGFACE_TOKEN = hfToken // transcribe.py reads this for --diarize
  return env
}

/** The sidecar's own fatal-error report: {"error": "..."} on stdout. */
function sidecarError(stdout: string): string {
  // Whole stdout first, then its last line (in case a library printed first).
  const lines = stdout.trim().split('\n')
  for (const candidate of [stdout.trim(), lines[lines.length - 1]]) {
    try {
      const parsed = JSON.parse(candidate) as SidecarOutput
      if (typeof parsed.error === 'string' && parsed.error) return parsed.error
    } catch {
      /* not JSON — try the next candidate */
    }
  }
  return ''
}

/** Resolve how to launch the sidecar (built binary, or a python script in dev/test). */
function invocation(): { cmd: string; baseArgs: string[] } {
  const script = process.env.STONE_WHISPER_SCRIPT
  if (script) {
    // Windows installs Python as "python" (there is usually no "python3").
    const python = process.platform === 'win32' ? 'python' : 'python3'
    return { cmd: process.env.STONE_WHISPER_PYTHON || python, baseArgs: [script] }
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

    const childEnv = sidecarEnv(diarize ? cfg.huggingFaceToken : '')
    const timeout = timeoutForWav(audioPath)

    return new Promise<TranscriptionResult>((resolve, reject) => {
      const child = execFile(
        cmd,
        args,
        {
          env: childEnv,
          timeout,
          maxBuffer: 64 * 1024 * 1024,
          // The ML sidecar may ignore SIGTERM mid-inference; force-kill so a
          // timeout/overflow can't leave an orphaned process holding CPU/RAM.
          killSignal: 'SIGKILL'
        },
        (err, stdout, stderr) => {
          running.delete(child)
          if (err) {
            const e = err as NodeJS.ErrnoException & { killed?: boolean }
            // Node kills the child on overflow too, so check overflow BEFORE "killed".
            if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || /maxBuffer/i.test(e.message)) {
              return reject(
                new TranscriptionError(
                  'Transcription output was too large to read. Your audio is saved; please retry.',
                  true
                )
              )
            }
            if (e.killed) {
              return reject(
                new TranscriptionError(
                  'Transcription timed out. Your audio is saved — try again or use a smaller model.',
                  true
                )
              )
            }
            // Prefer the sidecar's own {"error": ...} report; stderr is mostly logs.
            const reason =
              sidecarError(stdout.toString()) ||
              (stderr || err.message || '').toString().trim().slice(-500)
            return reject(new TranscriptionError(`Transcription failed: ${reason || 'sidecar error'}`, true))
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
      running.add(child)
    })
  }
}
