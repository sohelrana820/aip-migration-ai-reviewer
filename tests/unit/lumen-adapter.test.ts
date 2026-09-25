import { describe, it, expect } from 'vitest'
import { LumenAdapter } from '../../src/server/adapters/lumen-adapter.js'
import { join } from 'path'

const FIXTURE = join(import.meta.dirname, '../fixtures/lumen')

describe('LumenAdapter.discover', () => {
  it('discovers all routes from web.php', async () => {
    const adapter = new LumenAdapter()
    const result = await adapter.discover(FIXTURE)
    const methods = result.endpoints.map(e => e.method)
    expect(methods).toContain('GET')
    expect(methods).toContain('POST')
    expect(methods).toContain('DELETE')
  })

  it('normalizes path parameters to {param} syntax', async () => {
    const adapter = new LumenAdapter()
    const result = await adapter.discover(FIXTURE)
    const paths = result.endpoints.map(e => e.path)
    expect(paths).toContain('/api/v1/users/{id}')
  })

  it('includes handler reference', async () => {
    const adapter = new LumenAdapter()
    const result = await adapter.discover(FIXTURE)
    const index = result.endpoints.find(e => e.method === 'GET' && e.path === '/api/v1/users')
    expect(index?.handler).toContain('UserController')
  })

  it('records source file relative path', async () => {
    const adapter = new LumenAdapter()
    const result = await adapter.discover(FIXTURE)
    expect(result.endpoints[0].sourceFile).toMatch(/routes\/web\.php/)
  })
})
