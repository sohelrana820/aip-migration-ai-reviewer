export const MIGRATIONS: string[] = [
  /* 001 */ `
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      source_path TEXT NOT NULL,
      target_path TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS endpoints (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      repo        TEXT NOT NULL CHECK(repo IN ('source','target')),
      method      TEXT NOT NULL,
      path        TEXT NOT NULL,
      handler     TEXT NOT NULL,
      source_file TEXT NOT NULL,
      framework   TEXT NOT NULL CHECK(framework IN ('lumen','nestjs')),
      diagnostics TEXT NOT NULL DEFAULT '[]',
      discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mapping_groups (
      id               TEXT PRIMARY KEY,
      project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      group_type       TEXT NOT NULL CHECK(group_type IN ('one-to-one','one-to-many','many-to-one')),
      source_ids       TEXT NOT NULL DEFAULT '[]',
      target_ids       TEXT NOT NULL DEFAULT '[]',
      correspondence   TEXT,
      status           TEXT NOT NULL DEFAULT 'unmatched'
                         CHECK(status IN ('matched','manual','unmatched','uncertain')),
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `
]
