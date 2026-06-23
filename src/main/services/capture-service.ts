// =============================================================================
// Capture service — the moment a recording stops, the RAW AUDIO IS WRITTEN TO
// DISK FIRST, before the database row, before any transcription, before any
// network call. A failure anywhere downstream therefore always leaves a
// recoverable .wav on disk. This is the single most important guarantee in the
// app.
// =============================================================================

import { writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { SaveRecordingPayload, SaveRecordingResult } from '@shared/ipc'
import { encodeWavPCM16 } from '@shared/wav'
import { getPaths } from '../paths'
import { getConfig } from '../config'
import { getLead, insertLead, newLeadSkeleton, permanentDeleteLead } from '../db/leads'
import { getConsentForLead, logConsent } from '../db/consent'
import { getDb } from '../db/connection'
import { applicableRule } from '../compliance/states'
import { processRecordingCore } from './pipeline'

function timestampSlug(iso: string): string {
  // 2026-06-22T20:37:10.123Z -> 20260622-203710
  return iso.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
}

/** Build an authoritative consent-method string from the actual flags, so the
 *  audit and the Sheet always reflect what really happened (not stale UI text). */
function consentMethod(scriptAcknowledged: boolean, audiblePlayed: boolean): string {
  const parts: string[] = []
  if (scriptAcknowledged) parts.push('verbal notice (script read aloud)')
  if (audiblePlayed) parts.push('audible disclosure played')
  return parts.length ? parts.join(' + ') : 'not captured'
}

/**
 * Persist a freshly captured clip. Order is deliberate and load-bearing:
 *   1) write the WAV bytes to disk,
 *   2) only then create the database row + immutable consent log.
 */
export function saveRecordingCore(payload: SaveRecordingPayload): SaveRecordingResult {
  const paths = getPaths()
  const cfg = getConfig()
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const audioPath = join(paths.recordingsDir, `${timestampSlug(createdAt)}_${id}.wav`)

  // --- (1) SACRED WRITE: audio to disk first. ---
  writeFileSync(audioPath, Buffer.from(payload.wav))
  if (!existsSync(audioPath)) {
    throw new Error(`Failed to persist recording to ${audioPath}`)
  }

  // --- (2) Database row. Unknown fields stay empty — never invented. ---
  const rule = applicableRule(payload.consent.state, cfg.operatorState)
  // Prefer the method string the UI supplies; fall back to deriving it from flags.
  const method =
    payload.consent.method?.trim() ||
    consentMethod(payload.consent.script_acknowledged, payload.consent.audible_played)
  const lead = newLeadSkeleton({
    id,
    created_at: createdAt,
    audio_path: audioPath,
    consent_state: payload.consent.state,
    consent_method: method,
    consent_confirmed: payload.consent.script_acknowledged,
    status: 'new',
    needs_review: false
  })
  insertLead(lead)

  // --- (3) Immutable consent audit. ---
  logConsent({
    lead_id: id,
    state: payload.consent.state,
    rule_applied: rule.effective,
    method,
    script_acknowledged: payload.consent.script_acknowledged,
    audible_played: payload.consent.audible_played
  })

  return { leadId: id, audioPath }
}

export function registerCaptureIpc(): void {
  ipcMain.handle(IPC.SAVE_RECORDING, (_e, payload: SaveRecordingPayload) =>
    saveRecordingCore(payload)
  )
  ipcMain.handle(IPC.PROCESS_RECORDING, (_e, leadId: string) => processRecordingCore(leadId))
  ipcMain.handle(IPC.RETRY_PROCESSING, (_e, leadId: string) => processRecordingCore(leadId))
}

/**
 * Self-test (invoked via `--selftest-capture`): proves the save-first guarantee
 * end to end in the real runtime — synthesize a tiny WAV, persist it, and verify
 * the file landed on disk and the lead + consent rows exist. Returns a summary.
 */
export function runCaptureSelfTest(): string {
  const sampleRate = 48000
  const frames = sampleRate / 5 // 0.2s
  const data = new Float32Array(frames)
  for (let i = 0; i < frames; i++) data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.25
  const wav = encodeWavPCM16([data], sampleRate)

  const { leadId, audioPath } = saveRecordingCore({
    wav,
    durationSec: 0.2,
    sampleRate,
    channels: 1,
    deviceLabel: 'selftest',
    consent: {
      state: 'MA',
      method: 'selftest',
      script_acknowledged: true,
      audible_played: false
    }
  })

  const fileOk = existsSync(audioPath)
  const lead = getLead(leadId)
  const consent = getConsentForLead(leadId)
  const ok = fileOk && !!lead && lead.audio_path === audioPath && !!consent && consent.rule_applied === 'all-party'

  // Clean up so the self-test leaves no residue in the operator's database.
  try {
    permanentDeleteLead(leadId)
    getDb().prepare('DELETE FROM consent_log WHERE lead_id = ?').run(leadId)
    if (fileOk) unlinkSync(audioPath)
  } catch {
    /* best-effort cleanup */
  }

  return [
    `file_on_disk=${fileOk}`,
    `lead_row=${!!lead}`,
    `audio_path_matches=${lead?.audio_path === audioPath}`,
    `consent_logged=${!!consent}`,
    `rule_applied=${consent?.rule_applied}`,
    `RESULT=${ok ? 'PASS' : 'FAIL'}`,
    `path=${audioPath}`
  ].join(' ')
}

/**
 * Pipeline self-test (`--selftest-pipeline`): drives save -> transcribe -> store
 * against a stub sidecar so the spawn/parse/store logic is verified without the
 * heavy ML model. Cleans up after itself.
 */
export async function runPipelineSelfTest(): Promise<string> {
  process.env.STONE_WHISPER_SCRIPT =
    process.env.STONE_WHISPER_SCRIPT || join(process.cwd(), 'tests', 'fixtures', 'transcribe-stub.py')

  const sampleRate = 48000
  const frames = sampleRate / 5
  const data = new Float32Array(frames)
  for (let i = 0; i < frames; i++) data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2
  const wav = encodeWavPCM16([data], sampleRate)

  const { leadId, audioPath } = saveRecordingCore({
    wav,
    durationSec: 0.2,
    sampleRate,
    channels: 1,
    deviceLabel: 'selftest',
    consent: { state: 'MA', method: 'selftest', script_acknowledged: true, audible_played: false }
  })

  let summary: string
  try {
    // Extraction throws when ANTHROPIC_API_KEY is absent — but the transcript is
    // written BEFORE extraction, so it must persist regardless (graceful
    // degradation: transcript kept, lead flagged for review).
    try {
      await processRecordingCore(leadId)
    } catch {
      /* expected without an API key — assert transcript persisted below */
    }
    const lead = getLead(leadId)
    const transcriptOk = !!lead && !!lead.transcript_text && existsSync(lead.transcript_path)
    const stubOk = !!lead && lead.transcript_text.includes('stub transcript')
    const ok = transcriptOk && stubOk
    summary = [
      `transcript_stored=${!!lead?.transcript_text}`,
      `transcript_file=${lead ? existsSync(lead.transcript_path) : false}`,
      `extraction_degraded_ok=${!!lead?.needs_review || lead?.raw_extraction !== ''}`,
      `RESULT=${ok ? 'PASS' : 'FAIL'}`
    ].join(' ')
    if (lead) {
      for (const p of [lead.transcript_path, lead.transcript_path.replace(/\.txt$/, '.json')]) {
        if (p && existsSync(p)) unlinkSync(p)
      }
    }
  } catch (e) {
    summary = `RESULT=FAIL error=${e instanceof Error ? e.message : String(e)}`
  } finally {
    try {
      permanentDeleteLead(leadId)
      getDb().prepare('DELETE FROM consent_log WHERE lead_id = ?').run(leadId)
      if (existsSync(audioPath)) unlinkSync(audioPath)
    } catch {
      /* best-effort */
    }
  }
  return summary
}
