// =============================================================================
// Google Sheets client — service-account auth (no browser sign-in, no token
// refresh). The key path lives in .env; the operator shares the target sheet
// with the service-account email. Scopes: spreadsheets (read/write) + drive.file
// (so a sheet we create can be shared back to the operator's Drive).
// =============================================================================

import { existsSync } from 'fs'
import { google, type sheets_v4, type drive_v3, type calendar_v3 } from 'googleapis'
import { getConfig, hasSecret } from '../config'

export class SheetsConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SheetsConfigError'
  }
}

export interface GoogleClients {
  sheets: sheets_v4.Sheets
  drive: drive_v3.Drive
  calendar: calendar_v3.Calendar
}

let cached: GoogleClients | null = null
let cachedAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null

export function getGoogleClients(): GoogleClients {
  if (cached) return cached
  const cfg = getConfig()
  if (!hasSecret(cfg.googleServiceAccountKeyPath)) {
    throw new SheetsConfigError(
      'GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set in .env. See SETUP.md to create a service account.'
    )
  }
  if (!existsSync(cfg.googleServiceAccountKeyPath)) {
    throw new SheetsConfigError(
      `Service-account key file not found at: ${cfg.googleServiceAccountKeyPath}`
    )
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: cfg.googleServiceAccountKeyPath,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/calendar.events'
    ]
  })
  // retry:false — gaxios would otherwise silently retry GET/PUT/DELETE 3× on
  // its own, stacked under withRetry below. withRetry is the ONE retry layer.
  cachedAuth = auth
  cached = {
    sheets: google.sheets({ version: 'v4', auth, retry: false }),
    drive: google.drive({ version: 'v3', auth, retry: false }),
    calendar: google.calendar({ version: 'v3', auth, retry: false })
  }
  return cached
}

/** An API failure with its HTTP status preserved and an operator-facing hint. */
export class GoogleApiError extends Error {
  status: number | undefined
  constructor(message: string, status: number | undefined) {
    super(message)
    this.name = 'GoogleApiError'
    this.status = status
  }
}

/** HTTP status of a gaxios / GoogleApiError failure, if any. */
export function googleStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; code?: unknown; response?: { status?: number } }
  if (typeof e?.status === 'number') return e.status
  if (typeof e?.code === 'number') return e.code
  return e?.response?.status
}

/**
 * The service-account email, ONLY if the key is already loaded in memory by a
 * prior request (never reads the key file just to build an error message).
 */
function serviceAccountEmail(): string {
  const cred = (cachedAuth as unknown as { cachedCredential?: { email?: unknown } | null } | null)
    ?.cachedCredential
  return typeof cred?.email === 'string' ? cred.email : ''
}

export type GoogleService = 'sheets' | 'calendar' | 'drive'

/** Map common Google failures to what the operator should actually do. Never includes secrets. */
function explain(err: unknown, service: GoogleService): GoogleApiError {
  if (err instanceof GoogleApiError) return err // already explained (nested call)
  const status = googleStatus(err)
  const original = (err instanceof Error ? err.message : String(err)).slice(0, 200)
  const email = serviceAccountEmail()
  const sa = email ? `the service-account email ${email}` : 'the service-account email (client_email in your key file)'
  let hint = ''
  if (status === 429 || (status === 403 && /rate ?limit|quota/i.test(original))) {
    hint = 'Google quota hit — wait a minute and retry.'
  } else if (status === 403) {
    hint =
      service === 'calendar'
        ? `Google denied access to the calendar. Share your calendar with ${sa} ("Make changes to events").`
        : `Google denied access. Share the Sheet with ${sa} (Editor).`
  } else if (status === 404) {
    hint =
      service === 'calendar'
        ? 'Calendar not found — check CALENDAR_ID and that it is shared with the service account.'
        : 'Sheet not found — check GOOGLE_SHEET_ID.'
  }
  return new GoogleApiError(hint ? `${hint} (Google: ${original})` : original, status)
}

export interface RetryOptions {
  /**
   * false = a non-idempotent POST (spreadsheets.create, an event insert with
   * no fixed id): a timeout may mean it DID land, so never blindly repeat it.
   * Appends stay retryable only because their fn re-reads the id column first.
   */
  idempotent?: boolean
  service?: GoogleService
}

const MAX_ATTEMPTS = 3
const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504])
const RETRYABLE_NET = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'])

/**
 * Up to 3 attempts with exponential backoff + jitter for transient failures
 * (408/429/5xx/network). `fn` receives the attempt number (0-based) so a write
 * can re-check whether an earlier, timed-out attempt actually succeeded. The
 * final error is mapped to an operator hint with its HTTP status preserved.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { idempotent = true, service = 'sheets' } = opts
  for (let n = 0; ; n++) {
    try {
      return await fn(n)
    } catch (err) {
      const status = googleStatus(err)
      const code = (err as { code?: unknown })?.code
      const retryable =
        (typeof status === 'number' && RETRYABLE_HTTP.has(status)) ||
        (typeof code === 'string' && RETRYABLE_NET.has(code))
      if (!idempotent || !retryable || n + 1 >= MAX_ATTEMPTS) throw explain(err, service)
      const backoff = 2 ** n * 1000 + Math.floor(Math.random() * 1000)
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
}
