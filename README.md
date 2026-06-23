# Stone Bridge Call Capture

A desktop app for Stone Bridge Strategic Partners that records seller phone calls,
transcribes them **locally** (audio never leaves the Mac), uses AI to extract structured lead
data, lets the operator review/correct each lead in a staging "Backend," and pushes approved
leads to a Google Sheet — one idempotent row per lead.

> **New here? You want [SETUP.md](SETUP.md)** — a numbered, copy‑paste guide that takes you from
> a clean Mac to a working push, written for a non‑developer.

---

## What it does (the pipeline)

```
Home page                                   Main process (Node)                 External
─────────                                   ───────────────────                 ────────
pick input + see live meter ── IPC ──►  fs write RAW WAV  ◄── SACRED: disk before anything else
pass consent gate · Record/Stop ─┘           │
                                             ├─► transcribe (local faster‑whisper sidecar)
                                             ├─► extract  (Anthropic Claude, forced tool use)
                                             ├─► SQLite (better‑sqlite3)  ◄── system of record
                                             └─► Google Sheets (service account, idempotent)
Backend page (review / edit / push) ◄────────┘
```

1. **Capture** — select an input device, confirm both voices register on the live meter, pass the
   consent gate, and record. The moment you stop, **the raw WAV is written to disk before any
   transcription or network call**, so a later failure can never destroy a recording.
2. **Transcribe** — a local faster‑whisper sidecar produces the transcript on your machine.
   Speaker labels are best‑effort (see Diarization below).
3. **Extract** — the transcript goes to the Anthropic API, which returns strict structured fields.
   Unknown fields are left **empty** — never invented.
4. **Review** — the lead lands in the Backend marked `new`, with the transcript and the extracted
   fields side by side so you can correct anything before it leaves your machine.
5. **Push** — approved leads go to a Google Sheet, one row per lead, keyed by a record id so
   re‑pushing **updates in place instead of duplicating**.

## The five decisions baked into this build

| Decision | Choice |
|---|---|
| Operating system | **macOS** (arm64) |
| How calls are made | **Physical phone on speaker** → laptop mic, single channel |
| Transcription engine | **Local Whisper** (faster‑whisper) — audio stays on the machine |
| Google Sheet | **Created on first run**, shared back to your email |
| Extraction model | **Claude Haiku 4.5**, escalates to Sonnet 4.6 only on failure |

## Architecture & key tradeoffs

- **Electron, not a web app.** Browsers can't reliably capture system audio and "run a server then
  open a tab" is too fragile for a single non‑developer user. A Python web‑app alternative is
  lighter to scaffold but loses reliable audio capture and adds runtime friction — so this is an
  Electron app. The renderer (React/TS/Tailwind) only draws UI and captures mic audio; **all
  secrets, the database, and every network call live in the main process.**
- **SQLite is the source of truth.** The app works fully offline. The Google Sheet is a downstream
  mirror of deliberate, confirmed pushes — local edits never silently change the Sheet, and pushes
  never duplicate rows.
- **Two‑sided audio.** This build targets *phone‑on‑speaker* capture: the laptop mic hears both you
  and the caller on one channel. That needs **no virtual audio device**, but fidelity and speaker
  separation are weaker, so the app relies on diarization to split speakers and warns you to
  confirm both voices on the meter. A *loopback* mode (BlackHole, mic‑left/system‑right) is
  scaffolded behind a setting for future softphone use.
- **Transcription is behind one interface with two implementations** (`src/main/transcription`):
  `LocalWhisper` (default, private) and `AssemblyAI` (opt‑in cloud, REST). Switching is a config
  flip in `.env`.
- **Diarization is graceful.** Speaker labels need a free Hugging Face token + pyannote. Without
  them, you still get a full transcript — just unlabeled. Transcription never blocks on it.
- **Strict extraction.** The Anthropic call uses **forced tool use** so the model must return
  schema‑shaped JSON, which is then **validated with Zod** (E.164 phone format, "ambiguous ⇒ empty"
  rule, required keys). If validation fails after one model escalation, the transcript is kept and
  the lead is flagged `needs_review` — never dropped, never fabricated.
- **Idempotent Sheets writes.** Each push looks the lead up by id in column A and updates that row
  or appends a new one. The Sheet stores the **summary and file links only**, not the full
  transcript, so it stays readable.

## Project layout

```
src/main/            Electron main: config, paths, db, transcription, extraction, sheets, ipc
  config.ts          loads .env (secrets ONLY here), typed CONFIG
  paths.ts           userData dirs (recordings/transcripts/models) created at startup
  db/                better-sqlite3 schema + leads/consent/settings repositories
  compliance/states.ts  verified 51‑jurisdiction consent map + "default to stricter rule" logic
  transcription/     Transcriber interface + LocalWhisper + AssemblyAI
  extraction/        Anthropic forced‑tool‑use extraction + Zod schema
  sheets/            service‑account client + idempotent upsert
  services/          capture (save‑first), pipeline (transcribe→extract), leads, sheets
src/preload/         contextBridge — the renderer's only door to main
src/renderer/        React UI: Home (console) + Backend (review), brand theme
src/shared/          types, IPC contract, WAV encoder, compliance copy
resources/whisper-sidecar/  faster‑whisper sidecar source (transcribe.py)
scripts/build-sidecar.sh    builds the sidecar into a self‑contained executable
tests/fixtures/      test‑only stubs (never bundled)
```

## Develop

```bash
npm install
npm run rebuild      # rebuild better-sqlite3 against Electron's ABI (once)
npm run dev          # launch with hot reload
npm run typecheck    # strict TypeScript across main + renderer
npm run verify       # build + run the headless self-test suite (below)
```

### Built‑in self‑tests (no GUI, no secrets needed)

The app can verify its own critical paths headlessly:

| Command | Proves |
|---|---|
| `npm run smoke` | config + DB migration + IPC register |
| `electron . --selftest-capture` | **raw WAV written to disk before** the DB row; consent logged |
| `electron . --selftest-pipeline` | transcript stored; extraction **degrades gracefully** without a key |
| `electron . --selftest-extraction` | Zod **no‑fabrication** guards (E.164, ambiguous, required) |
| `electron . --selftest-backend` | add / edit / search / soft‑delete / restore / permanent‑delete |
| `electron . --selftest-sheets` | idempotent upsert row‑finding + summary‑only row mapping |

`npm run verify` runs all of them and reports PASS/FAIL.

## Package (macOS arm64)

```bash
./scripts/build-sidecar.sh   # one-time: build the faster-whisper sidecar on this Mac
npm run dist                 # produces dist/Stone Bridge Call Capture-<v>-arm64.dmg
```

> **Signing/notarization:** `electron-builder.yml` is set up for a hardened‑runtime mac build with
> a microphone‑usage entitlement. Producing a *notarized* `.dmg` requires an Apple Developer ID
> (set `CSC_*` env vars). Without one you can still build an unsigned app with
> `CSC_IDENTITY_AUTODISCOVERY=false npm run dist:dir` for local use (Gatekeeper will ask you to
> right‑click → Open the first time).

## Security & data integrity guardrails

- Secrets live **only** in `.env` (git‑ignored); an `.env.example` documents every value; secret
  values are never logged.
- Audio is written to disk **before** any network call. Every external call (transcription,
  Anthropic, Sheets) is wrapped so failures produce clear, retryable messages and never lose the
  local record.
- Deletes are **soft by default** (recoverable archive); permanent deletion is a separate,
  confirmed action; deleting a pushed lead **asks** before removing the Sheet row.
- There is **no fabricated data** anywhere in shipping code — no seed phone numbers, no demo
  addresses. Unknown fields are empty and labeled "not captured."

## Compliance

Massachusetts is an **all‑party** consent state (G.L. c.272 §99 — the statute turns on *secrecy*,
so clear notice cures it). The app ships a verified 51‑jurisdiction consent map, **defaults to the
stricter all‑party rule** whenever the lead's state is unknown, interstate, or unsettled, plays an
audible "this call is being recorded" notice, and logs consent immutably with each record. **This
is informational only, not legal advice** — see the persistent footer in the app.
