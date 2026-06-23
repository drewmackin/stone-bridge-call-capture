// =============================================================================
// Transcription interface — one contract, two interchangeable implementations
// (local Whisper sidecar, AssemblyAI cloud), selected by config. Whichever runs,
// the result is the same shape and a transcript file is written to disk.
// =============================================================================

import type { TranscriptionResult } from '@shared/types'

export interface TranscribeOptions {
  /** Absolute path to the recorded WAV. */
  audioPath: string
}

export interface Transcriber {
  readonly engine: 'local-whisper' | 'assemblyai'
  /** True once prerequisites (sidecar built / key present) are satisfied. */
  isAvailable(): { ok: boolean; reason: string }
  transcribe(opts: TranscribeOptions): Promise<TranscriptionResult>
}

/** Error that carries whether a retry is worth offering and that audio is safe. */
export class TranscriptionError extends Error {
  retryable: boolean
  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'TranscriptionError'
    this.retryable = retryable
  }
}
