import { describe, it, expect } from 'vitest'
import { NestJSAdapter } from '../../src/server/adapters/nestjs-adapter.js'
import { join } from 'path'

const FIXTURE = join(import.meta.dirname, '../fixtures/nestjs')

describe('NestJSAdapter.discover', () => {
  it('discovers all routes from controller', async () => {
    const adapter = new NestJSAdapter()
    const result = await adapter.discover(FIXTURE)
    expect(result.endpoints.length).toBe(5)
  })

  it('normalizes path parameters', async () => {
    const adapter = new NestJSAdapter()
    const result = await adapter.discover(FIXTURE)
    const paths = result.endpoints.map(e => e.path)
    expect(paths).toContain('/api/v1/users/{id}')
  })

  it('identifies method correctly', async () => {
    const adapter = new NestJSAdapter()
    const result = await adapter.discover(FIXTURE)
    const deleteRoute = result.endpoints.find(e => e.method === 'DELETE')
    expect(deleteRoute).toBeDefined()
    expect(deleteRoute?.handler).toContain('UsersController')
  })

  it('records source file as relative path', async () => {
    const adapter = new NestJSAdapter()
    const result = await adapter.discover(FIXTURE)
    expect(result.endpoints[0].sourceFile).not.toContain(FIXTURE)
    expect(result.endpoints[0].sourceFile).toMatch(/users\.controller\.ts$/)
  })
})
