// =============================================================================
// Schema + migrations. Idempotent: safe to run on every startup. A user_version
// pragma gates future migrations. The whole upgrade (DDL + the user_version
// bump) runs in ONE transaction: a crash midway rolls back to the old version
// instead of leaving an added column with a stale version, which would make
// the next launch fail on "duplicate column name" and brick startup.
// =============================================================================

import type { Database as DB } from 'better-sqlite3'

const SCHEMA_VERSION = 3

export function runMigrations(db: DB): void {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0
  if (current >= SCHEMA_VERSION) return
  db.transaction(() => migrate(db, current))()
}

function migrate(db: DB, current: number): void {
  if (current < 1) db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id                TEXT PRIMARY KEY,
      created_at        TEXT NOT NULL,

      name              TEXT NOT NULL DEFAULT '',
      phone_raw         TEXT NOT NULL DEFAULT '',
      phone_e164        TEXT NOT NULL DEFAULT '',
      phone_ambiguous   INTEGER NOT NULL DEFAULT 0,

      address           TEXT NOT NULL DEFAULT '',
      beds              TEXT NOT NULL DEFAULT '',
      baths             TEXT NOT NULL DEFAULT '',
      sqft              TEXT NOT NULL DEFAULT '',
      year_built        TEXT NOT NULL DEFAULT '',
      condition_notes   TEXT NOT NULL DEFAULT '',

      asking_price      TEXT NOT NULL DEFAULT '',
      motivation        TEXT NOT NULL DEFAULT '',
      timeline          TEXT NOT NULL DEFAULT '',
      summary           TEXT NOT NULL DEFAULT '',
      next_action       TEXT NOT NULL DEFAULT '',

      consent_state     TEXT NOT NULL DEFAULT '',
      consent_method    TEXT NOT NULL DEFAULT '',
      consent_confirmed INTEGER NOT NULL DEFAULT 0,

      transcript_path   TEXT NOT NULL DEFAULT '',
      audio_path        TEXT NOT NULL DEFAULT '',
      transcript_text   TEXT NOT NULL DEFAULT '',
      raw_extraction    TEXT NOT NULL DEFAULT '',

      status            TEXT NOT NULL DEFAULT 'new',
      needs_review      INTEGER NOT NULL DEFAULT 0,
      sheet_row         INTEGER,
      pushed_at         TEXT,
      deleted_at        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_created_at  ON leads(created_at);
    CREATE INDEX IF NOT EXISTS idx_leads_deleted_at  ON leads(deleted_at);

    -- Append-only consent audit. No UPDATE/DELETE in code paths.
    CREATE TABLE IF NOT EXISTS consent_log (
      id                  TEXT PRIMARY KEY,
      lead_id             TEXT NOT NULL,
      state               TEXT NOT NULL,
      rule_applied        TEXT NOT NULL,
      method              TEXT NOT NULL,
      script_acknowledged INTEGER NOT NULL DEFAULT 0,
      audible_played      INTEGER NOT NULL DEFAULT 0,
      timestamp           TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_consent_lead ON consent_log(lead_id);

    -- Small key/value store for main-process state (e.g. the created Sheet id).
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // v2: calendar integration — a parsed next-meeting time + the synced event.
  if (current < 2)
    db.exec(`
      ALTER TABLE leads ADD COLUMN meeting_datetime     TEXT NOT NULL DEFAULT '';
      ALTER TABLE leads ADD COLUMN calendar_event_id    TEXT NOT NULL DEFAULT '';
      ALTER TABLE leads ADD COLUMN calendar_event_link  TEXT NOT NULL DEFAULT '';
    `)

  // v3: AI call scorecard (score 0–100 + strengths/improvements), stored as JSON.
  if (current < 3)
    db.exec(`ALTER TABLE leads ADD COLUMN call_analysis TEXT NOT NULL DEFAULT '';`)

  db.pragma(`user_version = ${SCHEMA_VERSION}`)
}
