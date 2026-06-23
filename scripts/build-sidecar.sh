#!/usr/bin/env bash
# =============================================================================
# Build the local transcription sidecar into a self-contained executable so the
# packaged app can run faster-whisper without the operator installing Python.
#
# Produces: resources/whisper-sidecar/stone-whisper  (+ its _internal/ libs)
#
# Run this ONCE on the same OS/arch you ship (PyInstaller cannot cross-compile).
# Requires Python 3.9+ available as `python3`.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIDE="$ROOT/resources/whisper-sidecar"
BUILD="$ROOT/.sidecar-build"

# Fail early with a clear message if Python is too old (needs 3.9+).
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' || {
  echo "ERROR: Python 3.9+ is required (found: $(python3 --version 2>&1))." >&2
  exit 1
}

echo "==> Creating build venv at $BUILD"
python3 -m venv "$BUILD/venv"
# shellcheck disable=SC1091
source "$BUILD/venv/bin/activate"
# Deactivate the venv on exit (even on error) so we don't leave it active.
trap 'deactivate 2>/dev/null || true' EXIT

echo "==> Installing dependencies (faster-whisper + pyinstaller)"
pip install --upgrade pip wheel
pip install faster-whisper pyinstaller
# pyannote (+ torch) is optional, heavy, and only useful WITH a Hugging Face
# token at runtime. Off by default for a lean, fast build. Enable with:
#   WITH_DIARIZATION=1 ./scripts/build-sidecar.sh
if [ "${WITH_DIARIZATION:-0}" = "1" ]; then
  echo "==> Installing pyannote.audio for speaker labels (large: pulls in PyTorch)"
  pip install "pyannote.audio>=3.1" || echo "WARN: pyannote install failed — sidecar will work WITHOUT speaker labels"
else
  echo "==> Skipping pyannote/diarization (set WITH_DIARIZATION=1 to include speaker labels)"
fi

echo "==> Building with PyInstaller (onedir/BUNDLE mode — fast cold start, signs cleanly)"
cd "$BUILD"
pyinstaller --noconfirm --onedir --name stone-whisper \
  --collect-all faster_whisper \
  --collect-all ctranslate2 \
  "$SIDE/transcribe.py"

echo "==> Installing sidecar into $SIDE"
rm -rf "$SIDE/_internal" "$SIDE/stone-whisper"
cp -R "$BUILD/dist/stone-whisper/." "$SIDE/"
chmod +x "$SIDE/stone-whisper"

echo "==> Done. Sidecar at: $SIDE/stone-whisper"
echo "    Test it:  $SIDE/stone-whisper --audio /path/to/a.wav --model small --language en"
