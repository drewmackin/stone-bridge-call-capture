#!/usr/bin/env bash
# =============================================================================
# Headless self-test suite. Builds the app, then runs each --selftest mode in
# the real Electron runtime and checks for RESULT=PASS. No GUI, no secrets.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ELECTRON=./node_modules/.bin/electron

echo "==> Building"
npm run build >/dev/null 2>&1 || { echo "BUILD FAILED"; exit 1; }

pass=0; fail=0

check() { # <flag> <tag>
  local out ec
  out=$("$ELECTRON" . "$1" 2>/dev/null | grep -a "$2"); ec=${PIPESTATUS[0]}
  echo "$out"
  if [ "$ec" -ne 0 ]; then
    echo "[ERROR] electron exited $ec for $1 (crash/launch failure)"; fail=$((fail+1))
  elif echo "$out" | grep -q "RESULT=PASS"; then pass=$((pass+1)); else fail=$((fail+1)); fi
}

echo "==> smoke"
smoke=$(SMOKE_TEST=1 "$ELECTRON" . 2>/dev/null | grep -a '\[smoke\]')
echo "$smoke"
if echo "$smoke" | grep -q 'main process ready'; then pass=$((pass+1)); else fail=$((fail+1)); fi

check --selftest-capture    "\[selftest-capture\]"
check --selftest-pipeline   "\[selftest-pipeline\]"
check --selftest-extraction "\[selftest-extraction\]"
check --selftest-backend    "\[selftest-backend\]"
check --selftest-sheets     "\[selftest-sheets\]"
check --selftest-calendar   "\[selftest-calendar\]"

echo "==> PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
