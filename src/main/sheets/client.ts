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
  cached = {
    sheets: google.sheets({ version: 'v4', auth }),
    drive: google.drive({ version: 'v3', auth }),
    calendar: google.calendar({ version: 'v3', auth })
  }
  return cached
}

/** Truncated exponential backoff for transient (429/5xx/network) failures. */
export async function withRetry<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504])
  const RETRYABLE_NET = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'])
  for (let n = 0; ; n++) {
    try {
      return await fn()
    } catch (err) {
      const e = err as { code?: number | string; response?: { status?: number } }
      const status = typeof e.code === 'number' ? e.code : e.response?.status
      const retryable =
        (typeof status === 'number' && RETRYABLE_HTTP.has(status)) ||
        (typeof e.code === 'string' && RETRYABLE_NET.has(e.code))
      if (n >= retries || !retryable) throw err
      // Backoff with jitter, capped ~32s. (Date.now is fine in app runtime.)
      const backoff = Math.min(2 ** n * 1000 + Math.floor(Math.random() * 1000), 32000)
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
}
