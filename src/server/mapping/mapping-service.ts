import type { EndpointsRepo } from '../persistence/repos/endpoints-repo.js'
import type { MappingsRepo } from '../persistence/repos/mappings-repo.js'
import type { MappingGroup, ManualGroupOpts, GroupPatch } from './mapping-types.js'

export class MappingService {
  constructor(
    private endpointsRepo: EndpointsRepo,
    private mappingsRepo: MappingsRepo
  ) {}

  autoMatch(projectId: string): MappingGroup[] {
    const all = this.endpointsRepo.listByProject(projectId)
    const sources = all.filter(e => e.repo === 'source')
    const targets = all.filter(e => e.repo === 'target')

    const targetByKey = new Map(targets.map(e => [`${e.method}:${e.path}`, e]))
    const matchedTargetIds = new Set<string>()
    const groups: MappingGroup[] = []

    for (const src of sources) {
      const key = `${src.method}:${src.path}`
      const tgt = targetByKey.get(key)
      if (tgt) {
        matchedTargetIds.add(tgt.id)
        const row = this.mappingsRepo.create(projectId, 'one-to-one', [src.id], [tgt.id], 'matched')
        groups.push(this.toGroup(row))
      } else {
        const row = this.mappingsRepo.create(projectId, 'one-to-one', [src.id], [], 'unmatched')
        groups.push(this.toGroup(row))
      }
    }

    for (const tgt of targets.filter(t => !matchedTargetIds.has(t.id))) {
      const row = this.mappingsRepo.create(projectId, 'one-to-one', [], [tgt.id], 'unmatched')
      groups.push(this.toGroup(row))
    }

    return groups
  }

  createManualGroup(projectId: string, opts: ManualGroupOpts): MappingGroup {
    const row = this.mappingsRepo.create(
      projectId,
      opts.groupType,
      opts.sourceIds,
      opts.targetIds,
      'manual',
      opts.correspondence
    )
    return this.toGroup(row)
  }

  updateGroup(id: string, patch: GroupPatch): MappingGroup {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch: Record<string, unknown> = {}
    if (patch.sourceIds) dbPatch['source_ids'] = JSON.stringify(patch.sourceIds)
    if (patch.targetIds) dbPatch['target_ids'] = JSON.stringify(patch.targetIds)
    if (patch.groupType) dbPatch['group_type'] = patch.groupType
    if (patch.status) dbPatch['status'] = patch.status
    if (patch.correspondence !== undefined) dbPatch['correspondence'] = patch.correspondence
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.mappingsRepo.update(id, dbPatch as any)
    return this.toGroup(this.mappingsRepo.getById(id)!)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toGroup(row: any): MappingGroup {
    return {
      id: row.id,
      projectId: row.project_id,
      groupType: row.group_type,
      sourceIds: JSON.parse(row.source_ids),
      targetIds: JSON.parse(row.target_ids),
      correspondence: row.correspondence ?? undefined,
      status: row.status
    }
  }
}
