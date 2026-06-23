// =============================================================================
// Transcriber factory — pick the implementation from config. Local Whisper is
// the default (privacy: audio stays on the machine); AssemblyAI is opt-in.
// =============================================================================

import { getConfig } from '../config'
import type { Transcriber } from './Transcriber'
import { LocalWhisperTranscriber } from './LocalWhisper'
import { AssemblyAITranscriber } from './AssemblyAI'

export function getTranscriber(): Transcriber {
  return getConfig().transcriptionEngine === 'assemblyai'
    ? new AssemblyAITranscriber()
    : new LocalWhisperTranscriber()
}

export { TranscriptionError } from './Transcriber'
export type { Transcriber } from './Transcriber'
