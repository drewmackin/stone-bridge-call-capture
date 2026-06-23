// =============================================================================
// Configuration — loads the operator's .env (secrets ONLY here, never in code),
// and exposes a typed, read-once CONFIG object. Secret VALUES are never logged.
// =============================================================================

import { existsSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'
import { app } from 'electron'

export interface AppConfig {
  anthropicApiKey: string
  huggingFaceToken: string
  googleServiceAccountKeyPath: string
  googleSheetId: string
  operatorShareEmail: string
  operatorState: string
  whisperModel: string
  audioMode: 'speakerphone' | 'loopback'
  transcriptionEngine: 'local' | 'assemblyai'
  assemblyAiApiKey: string
  /** Google Calendar to write follow-up events to (defaults to the operator's email). */
  calendarId: string
  /** IANA timezone for meeting times parsed without an offset. */
  calendarTimezone: string
  /** Default event length in minutes. */
  calendarEventMinutes: number
  /** Absolute path of the .env we actually loaded (for diagnostics), or "". */
  envPathLoaded: string
}

let cached: AppConfig | null = null

/**
 * Candidate locations for the .env, in priority order. We support a dev layout
 * (project root) and a packaged layout (next to the app / in userData) so the
 * operator can drop the file in the obvious place.
 */
function candidateEnvPaths(): string[] {
  const paths: string[] = []
  if (process.env.STONE_BRIDGE_ENV) paths.push(process.env.STONE_BRIDGE_ENV)
  paths.push(join(process.cwd(), '.env'))
  try {
    paths.push(join(app.getPath('userData'), '.env'))
  } catch {
    // app not ready yet — userData unavailable; the cwd candidate still applies.
  }
  if (process.resourcesPath) paths.push(join(process.resourcesPath, '.env'))
  return paths
}

/** Load the first .env we find and build CONFIG. Idempotent. */
export function loadConfig(): AppConfig {
  if (cached) return cached

  let envPathLoaded = ''
  for (const p of candidateEnvPaths()) {
    if (existsSync(p)) {
      dotenv.config({ path: p })
      envPathLoaded = p
      break
    }
  }

  const e = process.env
  const operatorShareEmail = (e.OPERATOR_SHARE_EMAIL || '').trim()
  const calendarMinutes = parseInt((e.CALENDAR_EVENT_MINUTES || '').trim(), 10)
  cached = {
    anthropicApiKey: (e.ANTHROPIC_API_KEY || '').trim(),
    huggingFaceToken: (e.HUGGINGFACE_TOKEN || '').trim(),
    googleServiceAccountKeyPath: (e.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || '').trim(),
    googleSheetId: (e.GOOGLE_SHEET_ID || '').trim(),
    operatorShareEmail,
    operatorState: (e.OPERATOR_STATE || 'MA').trim().toUpperCase(),
    whisperModel: (e.WHISPER_MODEL || 'small').trim().toLowerCase(),
    audioMode: (e.AUDIO_MODE || 'speakerphone').trim().toLowerCase() === 'loopback' ? 'loopback' : 'speakerphone',
    transcriptionEngine:
      (e.TRANSCRIPTION_ENGINE || 'local').trim().toLowerCase() === 'assemblyai' ? 'assemblyai' : 'local',
    assemblyAiApiKey: (e.ASSEMBLYAI_API_KEY || '').trim(),
    calendarId: (e.CALENDAR_ID || '').trim() || operatorShareEmail,
    calendarTimezone: (e.CALENDAR_TIMEZONE || 'America/New_York').trim(),
    calendarEventMinutes: Number.isFinite(calendarMinutes) && calendarMinutes > 0 ? calendarMinutes : 30,
    envPathLoaded
  }
  return cached
}

export function getConfig(): AppConfig {
  return cached ?? loadConfig()
}

/** True if a secret is present, without revealing it. */
export function hasSecret(value: string): boolean {
  return typeof value === 'string' && value.length > 0
}
