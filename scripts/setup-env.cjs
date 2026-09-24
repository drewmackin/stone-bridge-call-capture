// =============================================================================
// Private .env setup. Creates the operator's .env from .env.example the first
// time, in the app's data folder — the one place BOTH `npm run dev` and the
// installed app read it from:
//   ~/Library/Application Support/stone-bridge-call-capture/.env
// It never overwrites an existing .env (there or in the project folder), holds
// no keys itself, and is chmod 600. Keys never go in the repo: it's public.
//
//   node scripts/setup-env.cjs          create it if missing (run by postinstall)
//   node scripts/setup-env.cjs --open   …then open it in TextEdit to paste keys
//
// STONE_BRIDGE_DATA_DIR overrides the data folder (used by tests).
// =============================================================================

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const repo = path.resolve(__dirname, '..')
const dataDir =
  process.env.STONE_BRIDGE_DATA_DIR ||
  path.join(os.homedir(), 'Library', 'Application Support', 'stone-bridge-call-capture')
const target = path.join(dataDir, '.env')
const rootEnv = path.join(repo, '.env')

function main() {
  if (process.platform !== 'darwin' && !process.env.STONE_BRIDGE_DATA_DIR) {
    console.log('setup-env: macOS only — copy .env.example to .env yourself on this platform.')
    return
  }
  let envPath = [rootEnv, target].find((p) => fs.existsSync(p))
  if (envPath) {
    console.log(`setup-env: using your existing ${envPath}`)
  } else {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.copyFileSync(path.join(repo, '.env.example'), target, fs.constants.COPYFILE_EXCL)
    fs.chmodSync(target, 0o600)
    envPath = target
    console.log(`setup-env: created ${target}`)
    console.log('setup-env: paste your keys into it — run `npm run keys` to open it.')
  }
  if (process.argv.includes('--open')) execFileSync('open', ['-e', envPath])
}

main()
