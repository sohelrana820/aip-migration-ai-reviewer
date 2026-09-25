import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface EndpointRow {
  id: string
  project_id: string
  repo: 'source' | 'target'
  method: string
  path: string
  handler: string
  source_file: string
  framework: 'lumen' | 'nestjs'
  diagnostics: string   // JSON string
  discovered_at: string
}

export class EndpointsRepo {
  constructor(private db: Database.Database) {}

  insertMany(projectId: string, endpoints: Omit<EndpointRow, 'id' | 'project_id' | 'discovered_at'>[]): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO endpoints (id, project_id, repo, method, path, handler, source_file, framework, diagnostics) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const insert = this.db.transaction((rows: typeof endpoints) => {
      for (const r of rows) {
        stmt.run(randomUUID(), projectId, r.repo, r.method, r.path, r.handler, r.source_file, r.framework, r.diagnostics)
      }
    })
    insert(endpoints)
  }

  listByProject(projectId: string): EndpointRow[] {
    return this.db.prepare('SELECT * FROM endpoints WHERE project_id = ? ORDER BY repo, method, path')
      .all(projectId) as EndpointRow[]
  }

  deleteByProject(projectId: string): void {
    this.db.prepare('DELETE FROM endpoints WHERE project_id = ?').run(projectId)
  }
}
