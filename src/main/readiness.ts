// =============================================================================
// Readiness — a non-secret snapshot of which capabilities are configured, shown
// on the Home page so the operator sees at a glance what works and what still
// needs setup. Secret VALUES are never included, only presence booleans.
// =============================================================================

import { existsSync } from 'fs'
import type { AppReadiness, ServiceStatus } from '@shared/types'
import { getConfig, hasSecret } from './config'
import { getPaths } from './paths'
import { resolveResource } from './resources'
import { getSetting } from './db/settings'
import { SETTING_SHEET_ID } from './sheets/sync'

function svc(configured: boolean, detail: string, ok = configured): ServiceStatus {
  return { configured, ok, detail }
}

/** Path to the built faster-whisper sidecar executable (built by scripts/build_sidecar.py). */
export function sidecarPath(): string {
  return resolveResource('whisper-sidecar', process.platform === 'win32' ? 'stone-whisper.exe' : 'stone-whisper')
}

export function computeReadiness(): AppReadiness {
  const cfg = getConfig()
  const paths = getPaths()

  const anthropic = hasSecret(cfg.anthropicApiKey)
    ? svc(true, 'Anthropic API key present.')
    : svc(false, 'Missing ANTHROPIC_API_KEY in .env — extraction is disabled until set.')

  let transcription: ServiceStatus
  if (cfg.transcriptionEngine === 'assemblyai') {
    transcription = hasSecret(cfg.assemblyAiApiKey)
      ? svc(true, 'AssemblyAI (cloud) engine selected and key present.')
      : svc(false, 'Engine is assemblyai but ASSEMBLYAI_API_KEY is missing.')
  } else {
    const built = existsSync(sidecarPath())
    transcription = built
      ? svc(true, `Local Whisper sidecar found. Model: ${cfg.whisperModel}.`)
      : svc(
          false,
          'Local Whisper sidecar not built yet. Run the sidecar build step (see SETUP.md). Recording still works; transcription will report this clearly.'
        )
  }

  const diarization = hasSecret(cfg.huggingFaceToken)
    ? svc(true, 'Hugging Face token present — speaker labels enabled.')
    : svc(false, 'No HUGGINGFACE_TOKEN — transcripts work but will not be speaker-labeled.')

  let sheets: ServiceStatus
  if (!hasSecret(cfg.googleServiceAccountKeyPath)) {
    sheets = svc(false, 'No GOOGLE_SERVICE_ACCOUNT_KEY_PATH — pushing to Sheets is disabled.')
  } else if (!existsSync(cfg.googleServiceAccountKeyPath)) {
    sheets = svc(false, `Service-account key file not found at the configured path.`)
  } else {
    // The app remembers the Sheet it created on the first push (settings table).
    sheets = svc(
      true,
      cfg.googleSheetId
        ? 'Service account configured; using the provided Sheet ID.'
        : getSetting(SETTING_SHEET_ID)
          ? 'Service account configured; pushing to the Sheet the app created earlier.'
          : 'Service account configured; a new Sheet will be created on first push.'
    )
  }

  // Calendar shares the service-account credential with Sheets; it also needs
  // a target calendar id, the Calendar API enabled and the calendar shared
  // with the SA at runtime.
  const calendar = !sheets.configured
    ? svc(false, 'Needs the Google service account (same as Sheets) + Calendar API enabled + your calendar shared with the service-account email.')
    : cfg.calendarId
      ? svc(true, `Will file follow-up events on ${cfg.calendarId} when a lead has a meeting time.`)
      : svc(false, 'No calendar set — add CALENDAR_ID (or OPERATOR_SHARE_EMAIL) to .env to file follow-up events.')

  return {
    anthropic,
    transcription,
    diarization,
    sheets,
    calendar,
    operatorState: cfg.operatorState,
    audioMode: cfg.audioMode,
    recordingsDir: paths.recordingsDir
  }
}
