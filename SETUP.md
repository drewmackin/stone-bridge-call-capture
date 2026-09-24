# Stone Bridge Call Capture — Setup Guide

Written for a non‑developer. Follow these in order. Copy‑paste the commands exactly. By the end
you'll have recorded a 30‑second test call, seen a transcript and extracted fields, and pushed a
row to a Google Sheet.

You only do steps 1–8 **once**. After that, day‑to‑day use is just: open the app → pick your mic →
pass the consent step → Record.

> Throughout, "Terminal" means the macOS **Terminal** app (press ⌘‑Space, type "Terminal", Enter).
> A line starting with `$` is a command — type/paste everything after the `$` and press Enter.
>
> **On Windows?** Read [Windows setup](#windows-setup) first — same steps, a few differences.

---

## 1. Install Node.js and the app

The app is built with Node.js.

1. Go to **https://nodejs.org/en/download** and download the **macOS Apple Silicon** installer for
   **Node.js 20 LTS** (the “.pkg”). Open it and click through the installer.
2. Get the app's project folder onto your Mac (the `stone-bridge-call-capture` folder).
3. Open Terminal and go into the folder. For example, if it's in your home folder:
   ```
   $ cd ~/stone-bridge-call-capture
   ```
4. Install and prepare it (one time):
   ```
   $ npm install
   ```
   This one command also rebuilds the database module for the app, fixes the macOS "malware"
   block on the development copy of Electron, and creates your private `.env` file (step 8).
5. Launch it:
   ```
   $ npm run dev
   ```
   The Stone Bridge window opens with **Record** and **Leads** in the title bar. (Later, you can build a
   double‑click app — see “Make a double‑click app” at the end.)

---

## 2. Allow the microphone

The first time you record, macOS asks for microphone permission — click **Allow**.

If you ever miss it: **Apple menu → System Settings → Privacy & Security → Microphone**, and turn on
the toggle for the app (or for Terminal, if you launched with `npm run dev`). Then click the
**refresh** button next to the Microphone menu on the Record screen.

---

## 3. Set up audio (phone on speaker)

This build is set up for **calling on a separate phone, on speakerphone**, with your laptop's
microphone listening to the room. There is **no extra software to install** for this mode.

1. On the Record screen, open the **Microphone** menu and pick the microphone that best hears the
   room (your built‑in mic, or a USB mic if you have one).
2. Put your phone on **speaker** and play any audio / talk.
3. Watch the **level meter**. You must see it move for **both** your voice **and** the caller's
   voice coming from the phone speaker. If the meter is flat, the recorder will capture silence —
   this is the #1 mistake. Try a different input device or move the phone closer to the mic.

<details>
<summary>Optional: higher‑quality capture from a softphone on the laptop (BlackHole)</summary>

If you later make calls **from the laptop** (Zoom/dialer) instead of a separate phone, you can
capture each side on its own channel:

1. Install **BlackHole 2ch** from **https://existential.audio/blackhole/** (or `brew install
   blackhole-2ch`). Restart when prompted.
2. Open **Audio MIDI Setup** (⌘‑Space → “Audio MIDI Setup”).
3. Create a **Multi‑Output Device** containing your **speakers/headphones** *and* **BlackHole 2ch**,
   with your real output listed at the top. Set **System Settings → Sound → Output** to this
   Multi‑Output so you still hear the call.
4. Create an **Aggregate Device** containing your **microphone** *and* **BlackHole 2ch**, mic at the
   top, drift correction on BlackHole.
5. Set `AUDIO_MODE=loopback` in `.env` (step 8) and pick the **Aggregate Device** as the input.

</details>

---

## 4. Build the local transcription engine

Transcription runs **on your Mac** (your audio never leaves it). You build the engine once.

```
$ npm run build:sidecar
```

This downloads and packages faster‑whisper (it needs Python 3.9+; `./scripts/build-sidecar.sh`
still works on a Mac too). It's a large download and takes several minutes. When
it finishes it prints the path to the built engine. The very first time you record, the app also
downloads the speech model (~0.5 GB) — that's a one‑time download.

> If you skip this step, recording still works and your audio is saved — the app will just tell you
> transcription isn't available yet and let you retry after you build it.

---

## 5. (Optional) Turn on speaker labels

To label who is the seller vs. you on single‑microphone recordings, the app can use a free Hugging
Face model:

1. Make a free account at **https://huggingface.co**, then go to **Settings → Access Tokens** and
   create a **Read** token (it starts with `hf_`).
2. Visit **https://huggingface.co/pyannote/speaker-diarization-3.1** and accept the model's terms.
3. Put the token in `.env` as `HUGGINGFACE_TOKEN` (step 8).

Without this, transcripts still work fully — they just won't be split by speaker.

---

## 6. Get your Anthropic API key (for extracting lead fields)

1. Go to **https://console.anthropic.com/** and sign in.
2. Open **API Keys** → **Create Key**. Copy it (it starts with `sk-ant-`).
3. You'll paste it into `.env` as `ANTHROPIC_API_KEY` (step 8).

---

## 7. Set up Google Sheets (the fiddly one — go slowly)

This lets the app push approved leads to a Google Sheet using a **service account** (a robot Google
identity), so there's no sign‑in popup.

**A. Create a project and turn on the APIs**
1. Go to **https://console.cloud.google.com/** and sign in with your Google account.
2. Top bar → project dropdown → **New Project** → name it “Stone Bridge” → **Create**. Make sure
   it's selected.
3. Left menu → **APIs & Services → Library**. Search **“Google Sheets API”** → open it → **Enable**.
4. Back in Library, search **“Google Drive API”** → open it → **Enable**. (Needed so the app can
   share the new sheet back to you.)

**B. Create the service account**
5. Left menu → **APIs & Services → Credentials** (or **IAM & Admin → Service Accounts**).
6. **Create credentials → Service account**. Name it `sheets-writer` → **Create and continue** →
   skip the optional role → **Done**.

**C. Download its key file**
7. Click the new service account → **Keys** tab → **Add key → Create new key → JSON → Create**. A
   `.json` file downloads. **You can't re‑download it**, so keep it safe.
8. Move that file into your project folder and note its full path, e.g.
   `~/stone-bridge-call-capture/service-account.json`.

**D. (Only if you bring your own sheet)**
9. If you leave `GOOGLE_SHEET_ID` blank, the app **creates the sheet for you** on first push and
   shares it with your email automatically — nothing else to do.
   If instead you want to use an **existing** sheet, open it in your browser → **Share** → paste the
   service account's email (it looks like `sheets-writer@stone-bridge‑xxxx.iam.gserviceaccount.com`,
   shown on the service account's **Details** tab) → give it **Editor** → uncheck “Notify” → Share.
   Then copy the sheet's ID from its URL (`.../spreadsheets/d/THIS_PART/edit`) into
   `GOOGLE_SHEET_ID`.

---

## 8. Fill in the `.env` file

`npm install` already created your private `.env` (from `.env.example`) in the app's data folder,
`~/Library/Application Support/stone-bridge-call-capture/.env` — the one place both `npm run dev`
and the installed app read it from.

1. Open it:
   ```
   $ npm run keys
   ```
2. Fill in the values you collected:

   - `ANTHROPIC_API_KEY` — your `sk-ant-…` key from step 6. **Required.**
   - `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` — the full path to the `.json` file from step 7C, e.g.
     `/Users/you/stone-bridge-call-capture/service-account.json`. **Required to push.**
   - `GOOGLE_SHEET_ID` — leave **blank** to have the app create the sheet on first push.
   - `OPERATOR_SHARE_EMAIL` — your Google email (so the created sheet shows up in your Drive).
   - `HUGGINGFACE_TOKEN` — optional, from step 5.
   - Leave the rest at their defaults (`OPERATOR_STATE=MA`, `WHISPER_MODEL=small`,
     `AUDIO_MODE=speakerphone`).

3. Save the file. **Never commit `.env` or the `.json` key** — they're secrets, git ignores them,
   and this repository is public. To give a teammate access, see “Working with a teammate” below.

Restart the app (`Ctrl‑C` in Terminal, then `npm run dev`). The status button at the top right of
the window should now read **All set** (click it to see each service).

---

## 9. Do a 30‑second test call

1. **Record** → pick your microphone and confirm the meter moves for both voices.
2. Under **Seller's state**, pick the seller's state; the consent rule for that call appears next
   to it. The **Record** button turns gold and the card says **Ready to record**.
3. Click **Record**, talk for ~30 seconds (say a fake name, phone, and address out loud so you can
   see them get extracted), then **Stop**.
4. Watch the panel under the call card: **Saved to disk → Transcribe → Pull out lead details →
   Lead ready to review**. Your audio is saved to disk the instant you stop — before anything else.
5. Click **Review lead** (or go to **Leads → To review**). The transcript is on the left, the
   extracted fields on the right. Empty fields are marked **“not captured.”** Fix anything, press
   **Save changes** (⌘S), then **Approve**.
6. Click **Push to Sheet** (or **Push approved** from the Leads list). The first push creates and
   shares the sheet (check your Drive / the printed URL). Push again — the same row updates; no
   duplicate appears.

That's the whole chain working. 🎉

---

## 10. Troubleshooting

**The recording is silent / one voice is missing.**
The input device is wrong. On Record, play audio and watch the meter — select the device whose meter
actually moves for *both* voices. Move the phone closer to the mic. (In the optional BlackHole
setup, also confirm System Output is set to the Multi‑Output device.)

**“Local Whisper sidecar is not built.”**
You haven't run step 4 yet, or it didn't finish. Run `npm run build:sidecar` again and watch
for errors. Your already‑recorded audio is safe — open the lead in Leads and press **Transcribe**
above its transcript after the build succeeds.

**Transcription fails or times out.**
Try the smaller model: set `WHISPER_MODEL=base` in `.env` and retry. The audio is never lost.

**Push fails with a permission error (403).**
The sheet isn't shared with the service account, or an API isn't enabled. Re‑check step 7A (both
Sheets API **and** Drive API enabled) and, if you used your own sheet, that you shared it with the
service account's email as **Editor**.

**Push fails with “key file not found.”**
`GOOGLE_SERVICE_ACCOUNT_KEY_PATH` in `.env` doesn't point at the real `.json` file. Paste the full,
absolute path.

**Extraction says it needs review / fields are blank.**
Either `ANTHROPIC_API_KEY` is missing/invalid, or the model wasn't confident. The transcript is
always kept — read it on the lead’s page and fill the fields yourself. The app never invents data.

**Microphone is blocked.**
System Settings → Privacy & Security → Microphone → enable the app (or Terminal), then click the
**refresh** button next to the Microphone menu on Record.

---

## Windows setup

The app runs on Windows 10/11 (64‑bit) too. Follow the same steps with these differences:

1. **Install once:** [Git](https://git-scm.com/download/win), **Node.js 22 LTS** — exactly 22, not
   the newest (on [nodejs.org/en/download](https://nodejs.org/en/download) pick version **v22** →
   Windows Installer (.msi), x64; or `winget install OpenJS.NodeJS.22`) — and
   [Python 3.11+](https://www.python.org/downloads/) (3.14 works) — in the Python installer tick
   **“Add python.exe to PATH”**. Node 24 is not supported: `npm install` stops with “Unsupported
   engine”. [GitHub Desktop](https://desktop.github.com) is the
   easiest way to clone and push.
2. **Terminal = PowerShell** (Start → type “PowerShell”). Run the same commands without the `$`:
   `npm install`, `npm run build:sidecar`, `npm run keys`, `npm run dev`, `npm run verify`.
3. **Your `.env`** lives at `%APPDATA%\stone-bridge-call-capture\.env`; `npm run keys` opens it
   in Notepad. Key file paths use Windows form, e.g.
   `GOOGLE_SERVICE_ACCOUNT_KEY_PATH=C:\Users\you\keys\service-account.json`.
4. **Microphone:** Settings → Privacy & security → Microphone → turn on **“Let desktop apps access
   your microphone.”** Then press refresh next to the Microphone menu.
5. **Audio:** phone on speaker next to the laptop mic works the same. The optional two‑channel
   “loopback” setup in step 3 is macOS‑specific (BlackHole); on Windows use a USB call‑recording
   adapter that shows up as a stereo microphone.
6. **No Visual Studio needed** on Node 22 — the database module downloads ready-made. Only if
   `npm install` still fails while building `better-sqlite3`, install
   [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the
   **“Desktop development with C++”** workload, then run `npm run rebuild`.
7. **Windows installer (optional):** `npm run build:sidecar`, then `npm run dist:win` → the
   installer is in `dist\`. It's unsigned, so the first launch shows “Windows protected your PC” →
   **More info → Run anyway**.
8. **Shortcuts:** wherever this guide says ⌘, use **Ctrl** (e.g. Ctrl+S saves a lead).

---

## Working with a teammate

Both of you work on the same GitHub repository. Code goes through GitHub; **keys never do.**

1. **Access** — the owner adds the teammate on GitHub: repository → Settings → Collaborators →
   Add people. The teammate accepts the email invite.
2. **Code** — the teammate clones it (GitHub Desktop → File → Clone repository), then follows
   steps 1–4 above. `npm install` sets everything up, including an empty private `.env`.
3. **Keys** — shared privately, never in the repo:
   - `ANTHROPIC_API_KEY` — best if the teammate uses **their own** key (console.anthropic.com), so
     usage and billing stay separate.
   - Google — to push to the **same** Sheet/Calendar, the owner sends the service-account `.json`
     file privately (AirDrop, or a shared password-manager item) and the teammate puts its path in
     `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`. For experiments, use a **separate test Sheet**
     (`GOOGLE_SHEET_ID`) so real leads aren't touched.
   - `HUGGINGFACE_TOKEN` (optional) — free; each person can make their own.
   - `OPERATOR_SHARE_EMAIL` / `CALENDAR_ID` — the teammate's own Google email.
   Run `npm run keys` to open the `.env` and paste them in.
4. **Without any keys** the app still runs: recording and saving work, and the Setup button says
   what's missing. For screen/UI work, `npm run ui` opens the real interface in a browser with
   sample data — no keys, no microphone needed.
5. **Day to day** — make a branch per change (GitHub Desktop → Branch → New Branch), push it,
   open a pull request, merge into `main`, then everyone clicks **Pull origin** on `main`.

---

## Make a double‑click app (optional)

To get a normal macOS app you can launch from Finder:

```
$ npm run build:sidecar              # if you haven't already
$ CSC_IDENTITY_AUTODISCOVERY=false npm run dist:dir
```

The app appears under `dist/mac-arm64/Stone Bridge Call Capture.app`. The first time you open it,
right‑click the app → **Open** (because it isn't notarized) and confirm. Put your `.env` and the
service‑account `.json` next to it, or in the app's data folder as the app instructs.

> Informational only, not legal advice. Verify your jurisdiction's current recording law.
