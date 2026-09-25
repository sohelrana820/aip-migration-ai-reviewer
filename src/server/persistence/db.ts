import Database from 'better-sqlite3'
import { MIGRATIONS } from './schema.js'

export function openDb(filePath: string): Database.Database {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[])
      .map(r => r.version)
  )
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1
    if (!applied.has(version)) {
      db.transaction(() => {
        db.exec(MIGRATIONS[i])
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version)
      })()
    }
  }
}
