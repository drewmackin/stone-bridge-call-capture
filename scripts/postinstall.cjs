// =============================================================================
// `npm install` → ready to run (macOS + Windows). Three steps, in order:
//  1. Rebuild native modules (better-sqlite3) for Electron's Node — without it
//     the app crashes on launch with a NODE_MODULE_VERSION mismatch. Required.
//     Uses @electron/rebuild's API (no .cmd shims to spawn on Windows).
//  2. macOS only: ad-hoc re-sign node_modules' Electron.app — Apple revoked the
//     stock unsigned binary's fingerprint and macOS deletes it as "malware"
//     (see scripts/adhoc-sign.cjs). A failure is reported, not fatal.
//  3. Create the private .env from .env.example if none exists (setup-env.cjs).
// =============================================================================

const path = require('path')
const { execFileSync } = require('child_process')

const repo = path.resolve(__dirname, '..')

async function main() {
  console.log('postinstall: rebuilding better-sqlite3 for Electron…')
  try {
    const { rebuild } = require('@electron/rebuild')
    const electronVersion = require('electron/package.json').version
    await rebuild({ buildPath: repo, electronVersion, onlyModules: ['better-sqlite3'], force: true })
    console.log('postinstall: native rebuild complete')
  } catch (e) {
    console.error(`postinstall: native rebuild FAILED — the app will not start.\n  ${e && e.message ? e.message : e}`)
    if (process.platform === 'win32') {
      console.error('  On Windows this usually means the C++ build tools are missing: install "Visual Studio Build Tools"')
      console.error('  with the "Desktop development with C++" workload, then run `npm run rebuild`.')
    }
    process.exit(1)
  }

  if (process.platform === 'darwin') {
    try {
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', path.join(repo, 'node_modules/electron/dist/Electron.app')], {
        stdio: 'inherit'
      })
    } catch {
      console.warn('postinstall: could not re-sign dev Electron; if macOS reports "malware", rerun `npm install`.')
    }
  }

  try {
    execFileSync(process.execPath, [path.join(__dirname, 'setup-env.cjs')], { stdio: 'inherit' })
  } catch {
    console.warn('postinstall: could not create the .env — copy .env.example yourself (see SETUP.md step 8).')
  }
}

main()
