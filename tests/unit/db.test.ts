import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '../../src/server/persistence/db.js'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir: string
let db: Database.Database

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'amr-test-'))
  db = openDb(join(tmpDir, 'test.db'))
})

afterEach(() => {
  db.close()
  rmSync(tmpDir, { recursive: true })
})

describe('openDb', () => {
  it('creates projects table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get()
    expect(row).toBeDefined()
  })

  it('creates endpoints table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='endpoints'").get()
    expect(row).toBeDefined()
  })

  it('creates mapping_groups table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mapping_groups'").get()
    expect(row).toBeDefined()
  })

  it('enables WAL mode', () => {
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    expect(row.journal_mode).toBe('wal')
  })
})
