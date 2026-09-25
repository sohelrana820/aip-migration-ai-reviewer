import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface MappingGroupRow {
  id: string
  project_id: string
  group_type: 'one-to-one' | 'one-to-many' | 'many-to-one'
  source_ids: string   // JSON
  target_ids: string   // JSON
  correspondence: string | null
  status: 'matched' | 'manual' | 'unmatched' | 'uncertain'
  created_at: string
  updated_at: string
}

export class MappingsRepo {
  constructor(private db: Database.Database) {}

  create(
    projectId: string,
    groupType: MappingGroupRow['group_type'],
    sourceIds: string[],
    targetIds: string[],
    status: MappingGroupRow['status'],
    correspondence?: string
  ): MappingGroupRow {
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO mapping_groups (id, project_id, group_type, source_ids, target_ids, status, correspondence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, groupType, JSON.stringify(sourceIds), JSON.stringify(targetIds), status, correspondence ?? null)
    return this.getById(id)!
  }

  getById(id: string): MappingGroupRow | undefined {
    return this.db.prepare('SELECT * FROM mapping_groups WHERE id = ?').get(id) as MappingGroupRow | undefined
  }

  listByProject(projectId: string): MappingGroupRow[] {
    return this.db.prepare('SELECT * FROM mapping_groups WHERE project_id = ? ORDER BY created_at')
      .all(projectId) as MappingGroupRow[]
  }

  update(id: string, patch: Partial<Pick<MappingGroupRow, 'source_ids' | 'target_ids' | 'group_type' | 'status' | 'correspondence'>>): void {
    const fields = Object.entries(patch)
      .map(([k]) => `${k} = ?`)
      .join(', ')
    const values = Object.values(patch)
    this.db.prepare(`UPDATE mapping_groups SET ${fields}, updated_at = datetime('now') WHERE id = ?`)
      .run(...values, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM mapping_groups WHERE id = ?').run(id)
  }

  deleteByProject(projectId: string): void {
    this.db.prepare('DELETE FROM mapping_groups WHERE project_id = ?').run(projectId)
  }
}
