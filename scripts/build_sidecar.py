#!/usr/bin/env python3
# =============================================================================
# Build the local transcription sidecar into a self-contained executable so the
# app can run faster-whisper without the operator installing Python packages.
# Works on macOS and Windows (run it on the OS you ship — PyInstaller can't
# cross-compile).
#
# Produces: resources/whisper-sidecar/stone-whisper      (macOS)
#           resources/whisper-sidecar/stone-whisper.exe  (Windows)
#           + its _internal/ libraries
#
# Requires Python 3.9+. Usually run via `npm run build:sidecar`.
# Speaker labels (pyannote + PyTorch, large) are opt-in: WITH_DIARIZATION=1.
# =============================================================================

import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path

if sys.version_info < (3, 9):
    sys.exit(f"ERROR: Python 3.9+ is required (found {sys.version.split()[0]}).")

ROOT = Path(__file__).resolve().parent.parent
SIDE = ROOT / "resources" / "whisper-sidecar"
BUILD = ROOT / ".sidecar-build"
WINDOWS = os.name == "nt"
EXE = "stone-whisper.exe" if WINDOWS else "stone-whisper"


def run(*args, cwd=None):
    print("   $", " ".join(str(a) for a in args), flush=True)
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)


def main():
    print(f"==> Creating build venv at {BUILD}", flush=True)
    venv.create(BUILD / "venv", with_pip=True, clear=False)
    py = BUILD / "venv" / ("Scripts/python.exe" if WINDOWS else "bin/python")

    print("==> Installing dependencies (faster-whisper + pyinstaller)", flush=True)
    run(py, "-m", "pip", "install", "--upgrade", "pip", "wheel")
    run(py, "-m", "pip", "install", "faster-whisper", "pyinstaller")
    if os.environ.get("WITH_DIARIZATION") == "1":
        print("==> Installing pyannote.audio for speaker labels (large: pulls in PyTorch)", flush=True)
        try:
            run(py, "-m", "pip", "install", "pyannote.audio>=3.1")
        except subprocess.CalledProcessError:
            print("WARN: pyannote install failed — sidecar will work WITHOUT speaker labels")
    else:
        print("==> Skipping pyannote/diarization (set WITH_DIARIZATION=1 to include speaker labels)")

    print("==> Building with PyInstaller (onedir — fast cold start)", flush=True)
    run(
        py, "-m", "PyInstaller", "--noconfirm", "--onedir", "--name", "stone-whisper",
        "--collect-all", "faster_whisper", "--collect-all", "ctranslate2",
        SIDE / "transcribe.py",
        cwd=BUILD,
    )

    print(f"==> Installing sidecar into {SIDE}", flush=True)
    shutil.rmtree(SIDE / "_internal", ignore_errors=True)
    for name in ("stone-whisper", "stone-whisper.exe"):
        target = SIDE / name
        if target.is_file():
            target.unlink()
    shutil.copytree(BUILD / "dist" / "stone-whisper", SIDE, dirs_exist_ok=True)
    if not WINDOWS:
        (SIDE / EXE).chmod(0o755)

    print(f"==> Done. Sidecar at: {SIDE / EXE}")
    print(f"    Test it:  \"{SIDE / EXE}\" --audio path/to/a.wav --model small --language en")


if __name__ == "__main__":
    main()
