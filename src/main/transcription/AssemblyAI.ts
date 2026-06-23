// =============================================================================
// AssemblyAI transcriber — the optional CLOUD engine (audio is uploaded). Off by
// default; selected via TRANSCRIPTION_ENGINE=assemblyai. Implemented over the
// REST API (no extra dependency) following the upload -> submit -> poll flow,
// with speaker diarization (speakers_expected: 2) and entity detection (stored
// alongside the transcript JSON for reference; the LLM extraction works from the
// transcript text). The key is read from env in the main process only.
// =============================================================================

import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import type { TranscriptionResult } from '@shared/types'
import { getConfig, hasSecret } from '../config'
import { type Transcriber, type TranscribeOptions, TranscriptionError } from './Transcriber'

const BASE = 'https://api.assemblyai.com/v2'

interface Utterance {
  speaker: string
  text: string
  start: number
  end: number
}
interface Entity {
  entity_type: string
  text: string
}
interface TranscriptObject {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'error'
  text?: string
  utterances?: Utterance[]
  entities?: Entity[]
  error?: string
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class AssemblyAITranscriber implements Transcriber {
  readonly engine = 'assemblyai' as const

  isAvailable(): { ok: boolean; reason: string } {
    return hasSecret(getConfig().assemblyAiApiKey)
      ? { ok: true, reason: 'AssemblyAI key present.' }
      : { ok: false, reason: 'ASSEMBLYAI_API_KEY is missing in .env.' }
  }

  async transcribe({ audioPath }: TranscribeOptions): Promise<TranscriptionResult> {
    const key = getConfig().assemblyAiApiKey
    if (!hasSecret(key)) throw new TranscriptionError('ASSEMBLYAI_API_KEY is missing.', false)
    if (!existsSync(audioPath)) throw new TranscriptionError(`Audio not found: ${audioPath}`, false)

    const headers = { authorization: key }

    // 1) Upload the local WAV bytes.
    let uploadUrl: string
    try {
      const bytes = await readFile(audioPath)
      const res = await fetch(`${BASE}/upload`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/octet-stream' },
        body: bytes
      })
      if (!res.ok) throw new Error(`upload HTTP ${res.status}`)
      uploadUrl = ((await res.json()) as { upload_url: string }).upload_url
    } catch (e) {
      throw new TranscriptionError(`Upload to AssemblyAI failed: ${msg(e)}. Audio is saved.`, true)
    }

    // 2) Submit the transcription job.
    let id: string
    try {
      const res = await fetch(`${BASE}/transcript`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          audio_url: uploadUrl,
          speaker_labels: true,
          speakers_expected: 2,
          entity_detection: true
        })
      })
      if (!res.ok) throw new Error(`submit HTTP ${res.status}`)
      id = ((await res.json()) as TranscriptObject).id
    } catch (e) {
      throw new TranscriptionError(`AssemblyAI submit failed: ${msg(e)}. Audio is saved.`, true)
    }

    // 3) Poll to completion (cap ~20 min).
    const deadline = Date.now() + 20 * 60 * 1000
    // Date.now is acceptable here (runtime polling), not in workflow scripts.
    for (;;) {
      await delay(3000)
      let t: TranscriptObject
      try {
        const res = await fetch(`${BASE}/transcript/${id}`, { headers })
        if (!res.ok) throw new Error(`poll HTTP ${res.status}`)
        t = (await res.json()) as TranscriptObject
      } catch (e) {
        if (Date.now() > deadline) throw new TranscriptionError(`Polling failed: ${msg(e)}`, true)
        continue
      }
      if (t.status === 'completed') {
        const segments = (t.utterances || []).map((u) => ({
          speaker: u.speaker || '',
          text: u.text || '',
          start_ms: u.start ?? 0,
          end_ms: u.end ?? 0
        }))
        return {
          text: t.text || '',
          segments,
          speaker_labeled: (t.utterances || []).length > 0,
          engine: 'assemblyai',
          entities: (t.entities || []).map((en) => ({ type: en.entity_type || '', text: en.text || '' }))
        }
      }
      if (t.status === 'error') {
        throw new TranscriptionError(`AssemblyAI error: ${t.error || 'unknown'}`, false)
      }
      if (Date.now() > deadline) {
        throw new TranscriptionError('AssemblyAI timed out. Audio is saved; please retry.', true)
      }
    }
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
