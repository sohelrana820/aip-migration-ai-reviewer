import type { Request, Response, NextFunction } from 'express'
import type { SessionManager } from './session.js'

export function requireSession(sessions: SessionManager) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.headers['authorization'] ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!sessions.validateSession(token)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    next()
  }
}
