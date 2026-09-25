import { describe, it, expect } from 'vitest'
import { createOriginMiddleware } from '../../src/server/transport/origin-middleware.js'
import type { Request, Response } from 'express'

function mockReq(headers: Record<string, string>): Partial<Request> {
  return { headers, method: 'GET' } as Partial<Request>
}

function mockRes(): { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; statusCode?: number } {
  const res = { json: vi.fn(), status: vi.fn() } as any
  res.status.mockReturnValue(res)
  return res
}

describe('createOriginMiddleware', () => {
  const mw = createOriginMiddleware(['http://localhost:5173'])

  it('passes requests with allowed origin', () => {
    const next = vi.fn()
    mw(mockReq({ origin: 'http://localhost:5173', host: 'localhost' }) as any, mockRes() as any, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('blocks requests with foreign origin', () => {
    const next = vi.fn()
    const res = mockRes()
    mw(mockReq({ origin: 'https://evil.example.com', host: 'localhost' }) as any, res as any, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('blocks requests with non-localhost host header', () => {
    const next = vi.fn()
    const res = mockRes()
    mw(mockReq({ host: 'external.example.com' }) as any, res as any, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('passes requests with no origin (same-origin GET)', () => {
    const next = vi.fn()
    mw(mockReq({ host: 'localhost:3000' }) as any, mockRes() as any, next)
    expect(next).toHaveBeenCalledOnce()
  })
})
