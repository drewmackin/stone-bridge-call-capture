# Stone Bridge Call Capture

A desktop app for Stone Bridge Strategic Partners that records seller phone calls,
transcribes them **locally** (audio never leaves the Mac), uses AI to extract structured lead
data, lets the operator review/correct each lead on the Leads screen, and pushes approved
leads to a Google Sheet — one idempotent row per lead.

> **New here? You want [SETUP.md](SETUP.md)** — a numbered, copy‑paste guide that takes you from
> a clean Mac to a working push, written for a non‑developer.

---

## What it does (the pipeline)

```
Record screen                               Main process (Node)                 External
─────────                                   ───────────────────                 ────────
pick input + see live meter ── IPC ──►  fs write RAW WAV  ◄── SACRED: disk before anything else
seller’s state + rule · Record/Stop ─┘       │
                                             ├─► transcribe (local faster‑whisper sidecar)
                                             ├─► extract  (Anthropic Claude, forced tool use)
                                             ├─► SQLite (better‑sqlite3)  ◄── system of record
                                             └─► Google Sheets (service account, idempotent)
Leads screen (review / approve / push) ◄─────┘
```

1. **Capture** — select an input device, confirm both voices register on the live meter, set the
   seller's state (the consent rule is shown and logged), and record. The moment you stop, **the raw WAV is written to disk before any
   transcription or network call**, so a later failure can never destroy a recording.
2. **Transcribe** — a local faster‑whisper sidecar produces the transcript on your machine.
   Speaker labels are best‑effort (see Diarization below).
3. **Extract** — the transcript goes to the Anthropic API, which returns strict structured fields.
   Unknown fields are left **empty** — never invented.
4. **Review** — the lead lands in Leads → To review, with the transcript and the extracted
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
src/renderer/        React UI: Record (call console) + Leads (review/push); OKLCH design tokens in index.css
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
npm run verify       # build + run the headless self-test suite (below) on a throwaway profile
```

**UI harness (no Electron, no data):** the real renderer in a browser with a mock backend and a
synthetic microphone — for design work and screenshots. Scenarios via `?s=default|empty|setup|nomic|fail`.

```bash
node_modules/.bin/vite --config design/harness/vite.config.mts   # → http://localhost:8030/?s=default
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

`npm run verify` runs all of them and reports PASS/FAIL. Each run uses a temporary
`--user-data-dir`, so it never touches the real leads database or its `.env`.

## Package (macOS arm64)

```bash
./scripts/build-sidecar.sh   # one-time: build the faster-whisper sidecar on this Mac
npm run dist                 # produces dist/Stone Bridge Call Capture-<v>-arm64.dmg
```

> **Signing:** without an Apple Developer ID the build is **ad‑hoc signed** by
> `scripts/adhoc-sign.cjs` (an electron-builder `afterPack` hook). That step is required: Apple has
> revoked the fingerprint (cdhash) of Electron's stock unsigned binary, and macOS deletes any app
> that ships it unchanged as "malware". The same fix runs on `node_modules`' dev Electron via
> `postinstall`. Hardened runtime stays **off** (it would silently block the mic under an ad‑hoc
> signature). macOS asks for microphone permission once after each rebuild. A notarized `.dmg`
> needs a Developer ID (`CSC_*` env vars) plus hardened runtime turned back on.

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
