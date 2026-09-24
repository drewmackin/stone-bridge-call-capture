// =============================================================================
// `npm install` → ready to run. Three steps, in order:
//  1. Rebuild native modules (better-sqlite3) for Electron's Node — without it
//     the app crashes on launch with a NODE_MODULE_VERSION mismatch. Required.
//  2. Ad-hoc re-sign node_modules' Electron.app: Apple revoked the stock unsigned
//     binary's fingerprint, and macOS deletes it as "malware" (see
//     scripts/adhoc-sign.cjs). macOS only; a failure is reported, not fatal.
//  3. Create the private .env from .env.example if none exists (setup-env.cjs).
// =============================================================================

const path = require('path')
const { execFileSync } = require('child_process')

const repo = path.resolve(__dirname, '..')
const bin = (name) => path.join(repo, 'node_modules', '.bin', name)
const run = (cmd, args) => execFileSync(cmd, args, { cwd: repo, stdio: 'inherit' })

console.log('postinstall: rebuilding better-sqlite3 for Electron…')
try {
  run(bin('electron-rebuild'), ['-f', '-w', 'better-sqlite3'])
} catch {
  console.error('postinstall: native rebuild FAILED — the app will not start. Run `npm run rebuild` and read the error.')
  process.exit(1)
}

if (process.platform === 'darwin') {
  try {
    run('codesign', ['--force', '--deep', '--sign', '-', path.join(repo, 'node_modules/electron/dist/Electron.app')])
  } catch {
    console.warn('postinstall: could not re-sign dev Electron; if macOS reports "malware", rerun `npm install`.')
  }
}

try {
  run(process.execPath, [path.join(__dirname, 'setup-env.cjs')])
} catch {
  console.warn('postinstall: could not create the .env — copy .env.example yourself (see SETUP.md step 8).')
}
