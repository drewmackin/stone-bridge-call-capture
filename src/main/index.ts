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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: '#091428',
    title: 'Stone Bridge Call Capture',
    titleBarStyle: 'hiddenInset',
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
  })
  setPipelineWindow(mainWindow)

  // Open external links (statute citations, etc.) in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block any in-page navigation away from our own UI (defense in depth — a
  // compromised renderer can't load remote content into the privileged window).
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      if (url.startsWith('http')) shell.openExternal(url)
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.whenReady().then(bootstrap).catch((e) => {
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  closeDb()
})
