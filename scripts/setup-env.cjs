// =============================================================================
// Private .env setup (macOS + Windows). Creates the operator's .env from
// .env.example the first time, in the app's data folder — the one place BOTH
// `npm run dev` and the installed app read it from (Electron's userData):
//   macOS:   ~/Library/Application Support/stone-bridge-call-capture/.env
//   Windows: %APPDATA%\stone-bridge-call-capture\.env
// It never overwrites an existing .env (there or in the project folder) and
// holds no keys itself. Keys never go in the repo: it's public.
//
//   node scripts/setup-env.cjs          create it if missing (run by postinstall)
//   node scripts/setup-env.cjs --open   …then open it in a text editor to paste keys
//
// STONE_BRIDGE_DATA_DIR overrides the data folder (used by tests).
// =============================================================================

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const APP = 'stone-bridge-call-capture' // package.json "name" = Electron's userData folder name
const repo = path.resolve(__dirname, '..')

function dataDir() {
  if (process.env.STONE_BRIDGE_DATA_DIR) return process.env.STONE_BRIDGE_DATA_DIR
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', APP)
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP)
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP)
}

function openInEditor(file) {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', ['-e', file]]
      : process.platform === 'win32'
        ? ['notepad.exe', [file]]
        : ['xdg-open', [file]]
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref()
}

function main() {
  const target = path.join(dataDir(), '.env')
  const rootEnv = path.join(repo, '.env')
  let envPath = [rootEnv, target].find((p) => fs.existsSync(p))
  if (envPath) {
    console.log(`setup-env: using your existing ${envPath}`)
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(repo, '.env.example'), target, fs.constants.COPYFILE_EXCL)
    if (process.platform !== 'win32') fs.chmodSync(target, 0o600) // Windows: %APPDATA% is already per-user
    envPath = target
    console.log(`setup-env: created ${target}`)
    console.log('setup-env: paste your keys into it — run `npm run keys` to open it.')
  }
  if (process.argv.includes('--open')) openInEditor(envPath)
}

main()
