export type GroupType = 'one-to-one' | 'one-to-many' | 'many-to-one'
export type GroupStatus = 'matched' | 'manual' | 'unmatched' | 'uncertain'

export interface MappingGroup {
  id: string
  projectId: string
  groupType: GroupType
  sourceIds: string[]
  targetIds: string[]
  correspondence?: string
  status: GroupStatus
}

export interface ManualGroupOpts {
  groupType: GroupType
  sourceIds: string[]
  targetIds: string[]
  correspondence?: string
}

export interface GroupPatch {
  sourceIds?: string[]
  targetIds?: string[]
  groupType?: GroupType
  status?: GroupStatus
  correspondence?: string
}
