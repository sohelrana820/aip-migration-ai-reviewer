import { describe, it, expect } from 'vitest'
import { WorkerPool } from '../../src/server/workers/worker-pool.js'
import { join } from 'path'

const FIXTURE_WORKER = join(import.meta.dirname, '../fixtures/echo-worker.mjs')

describe('WorkerPool', () => {
  it('returns result from worker', async () => {
    const pool = new WorkerPool({ maxWorkers: 2, timeoutMs: 5000 })
    const result = await pool.runJob<string>(FIXTURE_WORKER, { jobId: '1', type: 'echo', payload: 'hello' })
    expect(result).toBe('hello')
    await pool.shutdown()
  })

  it('throws on timeout', async () => {
    const pool = new WorkerPool({ maxWorkers: 1, timeoutMs: 50 })
    const SLOW_WORKER = join(import.meta.dirname, '../fixtures/slow-worker.mjs')
    await expect(pool.runJob(SLOW_WORKER, { jobId: '2', type: 'slow', payload: null }))
      .rejects.toThrow('timeout')
    await pool.shutdown()
  })
})
