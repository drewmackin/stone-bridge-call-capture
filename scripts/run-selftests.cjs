// =============================================================================
// Headless self-test suite (macOS + Windows). Builds the app, then runs each
// --selftest mode in the real Electron runtime and checks for RESULT=PASS.
// No GUI, no secrets.
//
// Every run gets a THROWAWAY profile (--user-data-dir): the self-tests write
// (then delete) rows, and the dev app's default userData is the SAME folder the
// installed app uses — so without this, `npm run verify` would touch the
// operator's real leads database and load the real .env.
//
//   node scripts/run-selftests.cjs            build + smoke + all self-tests
//   node scripts/run-selftests.cjs --smoke    build + smoke only (npm run smoke)
// =============================================================================

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const repo = path.resolve(__dirname, '..')
const electron = require('electron') // resolves to the Electron executable path under Node
const smokeOnly = process.argv.includes('--smoke')

console.log('==> Building')
// shell:true so "npm" resolves to npm.cmd on Windows; the args are fixed.
const build = spawnSync('npm', ['run', 'build'], { cwd: repo, shell: true, encoding: 'utf8' })
if (build.status !== 0) {
  console.log(build.stdout, build.stderr)
  console.log('BUILD FAILED')
  process.exit(1)
}

const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'stone-bridge-selftest-'))
let pass = 0
let fail = 0

function runElectron(args, extraEnv = {}) {
  const r = spawnSync(electron, ['.', ...args, `--user-data-dir=${ud}`], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024
  })
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`, error: r.error }
}

function check(label, args, tag, extraEnv, passWhen) {
  const r = runElectron(args, extraEnv)
  const lines = r.out.split(/\r?\n/).filter((l) => l.includes(tag))
  lines.forEach((l) => console.log(l))
  if (r.error || r.status !== 0) {
    console.log(`[FAIL] ${label}: electron exited ${r.status}${r.error ? ` (${r.error.message})` : ''}`)
    if (!lines.length) console.log(r.out.trim().split(/\r?\n/).slice(-15).join('\n'))
    fail++
  } else if (!lines.length) {
    console.log(`[FAIL] no result line for ${label}`)
    console.log(r.out.trim().split(/\r?\n/).slice(-15).join('\n'))
    fail++
  } else if (lines.some(passWhen)) {
    pass++
  } else {
    fail++
  }
}

try {
  console.log('==> smoke')
  check('smoke', [], '[smoke]', { SMOKE_TEST: '1' }, (l) => l.includes('main process ready'))

  if (!smokeOnly) {
    for (const mode of ['capture', 'pipeline', 'extraction', 'backend', 'sheets', 'calendar']) {
      check(`--selftest-${mode}`, [`--selftest-${mode}`], `[selftest-${mode}]`, {}, (l) => l.includes('RESULT=PASS'))
    }
  }
} finally {
  // Windows can hold Chromium cache files for a moment after exit — retry.
  try {
    fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  } catch {
    /* temp dir; the OS cleans it up */
  }
}

console.log(`==> PASS=${pass} FAIL=${fail}`)
process.exit(fail === 0 ? 0 : 1)
