#!/usr/bin/env bash
# =============================================================================
# Headless self-test suite. Builds the app, then runs each --selftest mode in
# the real Electron runtime and checks for RESULT=PASS. No GUI, no secrets.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ELECTRON=./node_modules/.bin/electron

# Every run gets a THROWAWAY profile: the self-tests write (then delete) rows, and
# the dev app's default userData is the SAME folder the installed app uses — so
# without this, `npm run verify` would touch the operator's real leads database
# and load the real .env from userData.
UD="$(mktemp -d -t stone-bridge-selftest)"
trap 'rm -rf "$UD"' EXIT

echo "==> Building"
npm run build >/dev/null 2>&1 || { echo "BUILD FAILED"; exit 1; }

pass=0; fail=0

check() { # <flag> <tag>
  local raw out ec
  # Capture Electron's own exit code separately: with pipefail, a grep that
  # simply finds no line would otherwise masquerade as an Electron crash.
  raw=$("$ELECTRON" . "$1" --user-data-dir="$UD" 2>/dev/null); ec=$?
  out=$(printf '%s\n' "$raw" | grep -a "$2")
  echo "$out"
  if [ "$ec" -ne 0 ]; then
    echo "[ERROR] electron exited $ec for $1 (crash/launch failure)"; fail=$((fail+1))
  elif ! echo "$out" | grep -q "RESULT="; then
    echo "[FAIL] no result line for $1"; fail=$((fail+1))
  elif echo "$out" | grep -q "RESULT=PASS"; then pass=$((pass+1)); else fail=$((fail+1)); fi
}

echo "==> smoke"
smoke=$(SMOKE_TEST=1 "$ELECTRON" . --user-data-dir="$UD" 2>/dev/null | grep -a '\[smoke\]')
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
