import type { Request, Response, NextFunction } from 'express'

const SAFE_HOSTS = /^(localhost|127\.0\.0\.1)(:\d+)?$/

export function createOriginMiddleware(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const host = req.headers['host'] ?? ''
    if (!SAFE_HOSTS.test(host)) {
      res.status(403).json({ error: 'Forbidden: unexpected host' })
      return
    }
    const origin = req.headers['origin']
    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'Forbidden: origin not allowed' })
      return
    }
    next()
  }
}
