import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MappingService } from '../../src/server/mapping/mapping-service.js'
import { openDb } from '../../src/server/persistence/db.js'
import { ProjectsRepo } from '../../src/server/persistence/repos/projects-repo.js'
import { EndpointsRepo } from '../../src/server/persistence/repos/endpoints-repo.js'
import { MappingsRepo } from '../../src/server/persistence/repos/mappings-repo.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type Database from 'better-sqlite3'

let tmpDir: string
let db: Database.Database
let service: MappingService
let projectId: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'amr-map-'))
  db = openDb(join(tmpDir, 'test.db'))
  const projectsRepo = new ProjectsRepo(db)
  const endpointsRepo = new EndpointsRepo(db)
  const mappingsRepo = new MappingsRepo(db)
  service = new MappingService(endpointsRepo, mappingsRepo)

  const project = projectsRepo.create('test', '/src', '/tgt')
  projectId = project.id

  endpointsRepo.insertMany(projectId, [
    { repo: 'source', method: 'GET', path: '/api/users', handler: 'UserController@index', source_file: 'routes/web.php', framework: 'lumen', diagnostics: '[]' },
    { repo: 'source', method: 'POST', path: '/api/users', handler: 'UserController@store', source_file: 'routes/web.php', framework: 'lumen', diagnostics: '[]' },
    { repo: 'target', method: 'GET', path: '/api/users', handler: 'UsersController@findAll', source_file: 'users.controller.ts', framework: 'nestjs', diagnostics: '[]' },
    { repo: 'target', method: 'DELETE', path: '/api/users/{id}', handler: 'UsersController@remove', source_file: 'users.controller.ts', framework: 'nestjs', diagnostics: '[]' },
  ])
})

afterEach(() => {
  db.close()
  rmSync(tmpDir, { recursive: true })
})

describe('MappingService.autoMatch', () => {
  it('matches endpoints by method and path', () => {
    const groups = service.autoMatch(projectId)
    const matched = groups.filter(g => g.status === 'matched')
    expect(matched.length).toBe(1)
    expect(matched[0].groupType).toBe('one-to-one')
  })

  it('marks source-only endpoints as unmatched', () => {
    const groups = service.autoMatch(projectId)
    const unmatched = groups.filter(g => g.sourceIds.length > 0 && g.targetIds.length === 0)
    expect(unmatched.length).toBeGreaterThan(0)
  })
})

describe('MappingService.createManualGroup', () => {
  it('creates a one-to-many group', () => {
    const group = service.createManualGroup(projectId, {
      groupType: 'one-to-many',
      sourceIds: ['s1'],
      targetIds: ['t1', 't2'],
      correspondence: 'split into two controllers'
    })
    expect(group.groupType).toBe('one-to-many')
    expect(group.correspondence).toBe('split into two controllers')
    expect(group.status).toBe('manual')
  })
})
