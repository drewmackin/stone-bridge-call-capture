// =============================================================================
// SQLite connection — the local database is the SYSTEM OF RECORD. The Google
// Sheet is only a downstream mirror. better-sqlite3 is synchronous and durable;
// WAL mode keeps writes fast and crash-safe.
// =============================================================================

import Database from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'
import { getPaths } from '../paths'
import { runMigrations } from './schema'

let db: DB | null = null

export function getDb(): DB {
  if (db) return db
  const { dbPath } = getPaths()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  runMigrations(db)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
