// =============================================================================
// Resolve bundled resources (the Python transcription sidecar, ffmpeg, the
// audible-disclosure template) for both dev and packaged layouts.
//   dev:      <projectRoot>/resources/<rel>
//   packaged: <process.resourcesPath>/resources/<rel>
// =============================================================================

import { join } from 'path'
import { app } from 'electron'

export function resolveResource(...rel: string[]): string {
  const base = app.isPackaged ? join(process.resourcesPath, 'resources') : join(process.cwd(), 'resources')
  return join(base, ...rel)
}
