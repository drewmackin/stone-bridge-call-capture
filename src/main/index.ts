// =============================================================================
// Main process entry — app lifecycle, the single browser window, microphone
// permission, database + config init, and IPC registration. Nothing here ever
// blocks on the network at startup, so the app always launches.
// =============================================================================

import { join } from 'path'
import { app, BrowserWindow, dialog, session, systemPreferences, shell } from 'electron'
import { loadConfig } from './config'
import { initPaths } from './paths'
import { getDb, closeDb } from './db/connection'
import { registerIpc } from './ipc'
import { runCaptureSelfTest, runPipelineSelfTest } from './services/capture-service'
import { setPipelineWindow } from './services/pipeline'
import { killAllTranscribers } from './transcription/LocalWhisper'
import { runExtractionValidationSelfTest } from './extraction/selftest'
import { runBackendSelfTest } from './services/leads-service'
import { runSheetsMappingSelfTest } from './sheets/sync'
import { runCalendarMappingSelfTest } from './calendar/sync'
import { runSheetTransferDemo } from './services/sheets-service'

const SMOKE_TEST = !!process.env.SMOKE_TEST
const SELFTEST_FLAGS = [
  '--selftest-capture',
  '--selftest-pipeline',
  '--selftest-extraction',
  '--selftest-backend',
  '--selftest-sheets',
  '--selftest-calendar',
  '--push-test-lead' // dev-only: live Sheets + Calendar transfer of a test row
]
// Self-tests/smoke run in development only — they are never reachable in the
// packaged app, so this QA scaffolding can't touch a real operator's data.
const RUN_SELFTESTS =
  !app.isPackaged && (SMOKE_TEST || SELFTEST_FLAGS.some((f) => process.argv.includes(f)))

// Safety net for the headless smoke/self-test runs: if the app never reaches
// "ready" (e.g. no display), terminate anyway so the check can't hang.
let watchdog: ReturnType<typeof setTimeout> | null = null
if (RUN_SELFTESTS) {
  watchdog = setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error('[smoke] watchdog fired before ready — exiting')
    process.exit(2)
  }, 20000)
}

let mainWindow: BrowserWindow | null = null
/** True once bootstrap has created the first window (DB + IPC are up). */
let booted = false

/**
 * Hand a URL to the system browser — http(s) only, so a crafted link can't
 * launch file:, smb: or custom-scheme handlers. Failures are swallowed (a
 * missing default browser must not surface as an unhandled rejection).
 */
function openExternalSafe(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
  shell.openExternal(parsed.toString()).catch(() => {})
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: '#091428',
    title: 'Stone Bridge Call Capture',
    // macOS: traffic lights inset into the navy toolbar. Windows/Linux: hidden
    // title bar with the native minimize/maximize/close drawn over the
    // toolbar's right edge ("hiddenInset" alone would leave NO window controls).
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { color: '#081328', symbolColor: '#ffffff', height: 52 }
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // Clear the reference when the window is destroyed so macOS can recreate it on
  // re-activation (app.on('activate') checks for zero open windows).
  mainWindow.on('closed', () => {
    mainWindow = null
    setPipelineWindow(null) // a running pipeline keeps going, it just stops emitting
  })
  setPipelineWindow(mainWindow)

  // The renderer's beforeunload handler vetoes unload while a call is being
  // recorded (the audio lives in memory until Stop). Electron then asks us —
  // and because Cmd+Q closes every window before quitting, this same prompt
  // guards quit as well: "Keep recording" cancels the close AND the quit.
  const contents = mainWindow.webContents
  contents.on('will-prevent-unload', (event) => {
    const owner = BrowserWindow.fromWebContents(contents)
    const opts = {
      type: 'warning' as const,
      buttons: ['Keep the app open', 'Discard the call and close'],
      defaultId: 0,
      cancelId: 0,
      message: 'This call isn’t saved yet.',
      detail:
        'A call is recording, or a finished call is waiting to be saved. Closing now discards that audio. Stop the recording (or press Retry save) first to keep it.'
    }
    const choice = owner ? dialog.showMessageBoxSync(owner, opts) : dialog.showMessageBoxSync(opts)
    if (choice === 1) event.preventDefault() // ignore the veto — let the close proceed
  })

  // Open external links (statute citations, etc.) in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })

  // Block any in-page navigation away from our own UI (defense in depth — a
  // compromised renderer can't load remote content into the privileged window).
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      openExternalSafe(url)
    }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Allow the renderer to use the microphone; deny everything else by default. */
function configureMediaPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
}

/** Dev-only self-test dispatch. Returns true if a self-test ran (app will quit). */
async function runSelfTestsIfRequested(): Promise<boolean> {
  if (SMOKE_TEST) {
    // eslint-disable-next-line no-console
    console.log('[smoke] main process ready: config loaded, database migrated, IPC registered')
    return true
  }
  const dispatch: Record<string, () => string | Promise<string>> = {
    '--selftest-capture': runCaptureSelfTest,
    '--selftest-pipeline': runPipelineSelfTest,
    '--selftest-extraction': runExtractionValidationSelfTest,
    '--selftest-backend': runBackendSelfTest,
    '--selftest-sheets': runSheetsMappingSelfTest,
    '--selftest-calendar': runCalendarMappingSelfTest,
    '--push-test-lead': runSheetTransferDemo
  }
  for (const flag of SELFTEST_FLAGS) {
    if (process.argv.includes(flag)) {
      // eslint-disable-next-line no-console
      console.log(`[${flag.slice(2)}]`, await dispatch[flag]())
      return true
    }
  }
  return false
}

async function bootstrap(): Promise<void> {
  // Reached "ready" — cancel the pre-ready watchdog so it can't fire mid-run
  // (e.g. during a self-test that legitimately takes longer than the timeout).
  if (watchdog) {
    clearTimeout(watchdog)
    watchdog = null
  }
  loadConfig()
  initPaths()
  getDb() // opens the DB and runs migrations (system of record)
  registerIpc()

  if (RUN_SELFTESTS && (await runSelfTestsIfRequested())) {
    app.quit()
    return
  }

  configureMediaPermissions()
  // Proactively request mic access on macOS so the OS prompt appears early.
  try {
    if (process.platform === 'darwin') await systemPreferences.askForMediaAccess('microphone')
  } catch {
    // Non-fatal: the renderer will surface a clear message if capture fails.
  }

  createWindow()
  booted = true

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

// One running copy per profile: a second launch focuses the existing window
// instead of opening a second writer on the same SQLite DB. The lock is keyed
// to the userData dir, so self-test runs on a throwaway --user-data-dir are
// unaffected by (and don't affect) a running operator app.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      if (booted) createWindow() // macOS: app alive with its window closed
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.whenReady().then(bootstrap).catch(onStartupFailure)
}

function onStartupFailure(e: unknown): void {
  // A startup failure (DB migration, mkdir, config) must be loud, not silent.
  const message = e instanceof Error ? e.message : String(e)
  // eslint-disable-next-line no-console
  console.error('[startup] fatal error:', message)
  try {
    dialog.showErrorBox('Stone Bridge Call Capture — startup failed', message)
  } catch {
    /* dialog may be unavailable pre-ready */
  }
  app.quit()
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  // A mid-inference Whisper sidecar would otherwise outlive the app.
  killAllTranscribers()
  closeDb()
})
