// =============================================================================
// `npm run build:sidecar` — find a Python 3.9+ on this machine (macOS:
// python3 · Windows: python or the "py -3" launcher) and run build_sidecar.py.
// Windows' Microsoft Store "python" alias is skipped: it fails --version.
// =============================================================================

const path = require('path')
const { spawnSync } = require('child_process')

const candidates =
  process.platform === 'win32'
    ? [['python'], ['py', '-3'], ['python3']]
    : [['python3'], ['python']]

const ok = (cmd) => {
  const r = spawnSync(cmd[0], [...cmd.slice(1), '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'])
  return r.status === 0
}

const python = candidates.find(ok)
if (!python) {
  console.error(
    'build:sidecar: no Python 3.9+ found. Install it from https://www.python.org/downloads/ ' +
      (process.platform === 'win32' ? '(tick "Add python.exe to PATH" in the installer), ' : '') +
      'then run this again.'
  )
  process.exit(1)
}

const r = spawnSync(python[0], [...python.slice(1), path.join(__dirname, 'build_sidecar.py')], { stdio: 'inherit' })
process.exit(r.status ?? 1)
