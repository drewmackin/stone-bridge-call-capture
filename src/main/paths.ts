// =============================================================================
// Filesystem paths — all writable app data lives under Electron's userData dir
// so the app works fully offline and survives reinstalls of the app bundle.
// Recordings are SACRED: the recordings dir is created eagerly at startup so a
// raw audio write can never fail for a missing directory.
// =============================================================================

import { mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface AppPaths {
  userData: string
  dbPath: string
  recordingsDir: string
  transcriptsDir: string
}

let cached: AppPaths | null = null

/** Compute + create all app directories. Call once after app is ready. */
export function initPaths(): AppPaths {
  if (cached) return cached
  const userData = app.getPath('userData')
  const paths: AppPaths = {
    userData,
    dbPath: join(userData, 'stone-bridge.sqlite'),
    recordingsDir: join(userData, 'recordings'),
    transcriptsDir: join(userData, 'transcripts')
  }
  for (const dir of [paths.recordingsDir, paths.transcriptsDir]) {
    mkdirSync(dir, { recursive: true })
  }
  cached = paths
  return paths
}

export function getPaths(): AppPaths {
  if (!cached) return initPaths()
  return cached
}
