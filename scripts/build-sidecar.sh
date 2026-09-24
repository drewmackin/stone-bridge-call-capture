#!/usr/bin/env bash
# Kept for existing Mac instructions — the real (cross-platform) build lives in
# build_sidecar.py. Prefer `npm run build:sidecar`, which also works on Windows.
set -euo pipefail
exec python3 "$(cd "$(dirname "$0")" && pwd)/build_sidecar.py" "$@"
