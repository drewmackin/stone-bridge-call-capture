// =============================================================================
// Processing pipeline — runs AFTER the audio is already safely on disk:
//   transcribe -> extract -> done
// Progress is streamed to the renderer so the Home status strip shows real
// steps, and every failure path makes clear the recording is safe and offers a
// retry. The pipeline never deletes or loses a record.
// =============================================================================

import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { Lead, PipelineProgress, ProcessingStage, TranscriptionResult } from '@shared/types'
import { getPaths } from '../paths'
import { getLead, updateLead } from '../db/leads'
import { getTranscriber, TranscriptionError } from '../transcription'
import { extractLead, ExtractionError } from '../extraction/extractLead'
import { scoreCall } from '../extraction/scoreCall'

let win: BrowserWindow | null = null
export function setPipelineWindow(w: BrowserWindow | null): void {
  win = w
}

/**
 * Progress is advisory: the operator may close the window mid-pipeline, and a
 * send to a destroyed window throws — which must never abort transcription or
 * extraction of a recording that is already on disk.
 */
function emit(p: PipelineProgress): void {
  try {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(IPC.PIPELINE_PROGRESS, p)
    }
  } catch {
    /* window went away between the check and the send — keep processing */
  }
}

function progress(
  leadId: string,
  stage: ProcessingStage,
  message: string,
  audioPathSafe: string | null,
  retryable = false
): void {
  emit({ leadId, stage, message, retryable, audioPathSafe })
}

/** Render a readable transcript: grouped by speaker when labels are present. */
export function formatTranscript(result: TranscriptionResult): string {
  if (!result.speaker_labeled || result.segments.every((s) => !s.speaker)) {
    return result.text.trim()
  }
  const lines: string[] = []
  let current = ''
  let buf: string[] = []
  const flush = (): void => {
    if (buf.length) lines.push(`${current}: ${buf.join(' ')}`)
    buf = []
  }
  for (const seg of result.segments) {
    const spk = seg.speaker || 'Speaker'
    if (spk !== current) {
      flush()
      current = spk
    }
    buf.push(seg.text)
  }
  flush()
  return lines.join('\n')
}

/**
 * Transcribe a saved recording, store the transcript, then AI-extract the lead
 * fields. Every failure path keeps the audio + transcript and flags for review.
 */
export async function processRecordingCore(leadId: string): Promise<Lead> {
  const lead = getLead(leadId)
  if (!lead) throw new Error(`Lead ${leadId} not found`)
  const safe = lead.audio_path

  if (!lead.audio_path || !existsSync(lead.audio_path)) {
    progress(leadId, 'error', 'The recording file is missing.', null, false)
    throw new Error('Recording file is missing for this lead.')
  }

  // --- Transcription ---
  const transcriber = getTranscriber()
  progress(
    leadId,
    'transcribing',
    transcriber.engine === 'local-whisper' ? 'Transcribing the call locally…' : 'Transcribing the call…',
    safe
  )
  let result: TranscriptionResult
  try {
    result = await transcriber.transcribe({ audioPath: lead.audio_path })
  } catch (e) {
    const retryable = e instanceof TranscriptionError ? e.retryable : true
    const message = e instanceof Error ? e.message : String(e)
    // Flag for review but keep everything — audio is safe.
    updateLead(leadId, { needs_review: true })
    progress(leadId, 'error', message, safe, retryable)
    throw new Error(message)
  }

  const paths = getPaths()
  const transcriptText = formatTranscript(result)
  // Persist transcript files best-effort; the transcript TEXT is the source of
  // truth in the DB, so a file-write failure (disk full / IO) never loses it.
  let txtPath = join(paths.transcriptsDir, `${leadId}.txt`)
  try {
    writeFileSync(txtPath, transcriptText, 'utf8')
    writeFileSync(join(paths.transcriptsDir, `${leadId}.json`), JSON.stringify(result, null, 2), 'utf8')
  } catch {
    txtPath = '' // file unavailable; the text below is still stored in the DB
  }

  let updated = updateLead(leadId, {
    transcript_text: transcriptText,
    transcript_path: txtPath
  })

  // Silence / no speech: there is nothing to extract, and sending an empty
  // transcript to the model only invites invented fields. Flag for review.
  const heardSpeech = !!result.text.trim() || result.segments.some((s) => s.text.trim())
  if (!heardSpeech) {
    updated = updateLead(leadId, { needs_review: true })
    progress(leadId, 'done', 'No speech was detected — review the recording.', safe)
    return updated
  }

  // --- Extraction ---
  progress(leadId, 'extracting', 'Extracting lead details with AI…', safe)
  try {
    const outcome = await extractLead(transcriptText, lead.created_at)
    if (outcome.ok) {
      // A field the model got wrong (bad phone / impossible meeting time) was
      // blanked rather than discarding everything — the operator must check it.
      updated = updateLead(leadId, {
        ...outcome.fields,
        raw_extraction: outcome.raw,
        needs_review: outcome.blanked.length > 0
      })
      // Grade the call against wholesaling best practices — best-effort; never
      // blocks the pipeline (the scorecard is a coaching nice-to-have).
      try {
        const analysis = await scoreCall(transcriptText)
        updated = updateLead(leadId, { call_analysis: JSON.stringify(analysis) })
      } catch {
        /* scoring failed (API hiccup) — lead is fine; operator can re-run later */
      }
    } else {
      // Model couldn't produce valid structured data — keep the transcript,
      // leave fields empty (never invented), and flag for manual review.
      updated = updateLead(leadId, { raw_extraction: outcome.raw, needs_review: true })
      progress(
        leadId,
        'done',
        'Transcript ready. AI extraction needs review — fields left blank, nothing invented.',
        safe
      )
      return updated
    }
  } catch (e) {
    // API/auth/network failure: transcript + audio are safe; offer a retry.
    const retryable = e instanceof ExtractionError ? e.retryable : true
    const message = e instanceof Error ? e.message : String(e)
    updateLead(leadId, { needs_review: true })
    progress(leadId, 'error', message, safe, retryable)
    throw new Error(message)
  }

  progress(
    leadId,
    'done',
    updated.needs_review
      ? 'Lead captured — some details could not be read cleanly and were left blank. Please review.'
      : result.speaker_labeled
        ? 'Lead captured (speaker-labeled transcript) — ready to review.'
        : 'Lead captured (speaker labels unavailable) — ready to review.',
    safe
  )
  return updated
}
