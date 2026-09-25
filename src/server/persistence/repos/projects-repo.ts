import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface ProjectRow {
  id: string
  name: string
  source_path: string
  target_path: string
  created_at: string
}

export class ProjectsRepo {
  constructor(private db: Database.Database) {}

  create(name: string, sourcePath: string, targetPath: string): ProjectRow {
    const id = randomUUID()
    this.db.prepare(
      'INSERT INTO projects (id, name, source_path, target_path) VALUES (?, ?, ?, ?)'
    ).run(id, name, sourcePath, targetPath)
    return this.getById(id)!
  }

  getById(id: string): ProjectRow | undefined {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
  }

  list(): ProjectRow[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[]
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }
}
