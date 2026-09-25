import { randomBytes } from 'crypto'

export class SessionManager {
  private bootstrapToken: string | null = null
  private sessions = new Set<string>()

  generateBootstrapCredential(): { token: string; expiresAt: Date } {
    this.bootstrapToken = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60_000) // 60 s validity
    return { token: this.bootstrapToken, expiresAt }
  }

  createSession(bootstrapToken: string): { sessionToken: string } | null {
    if (!this.bootstrapToken || bootstrapToken !== this.bootstrapToken) return null
    this.bootstrapToken = null  // single-use
    const sessionToken = randomBytes(32).toString('hex')
    this.sessions.add(sessionToken)
    return { sessionToken }
  }

  validateSession(sessionToken: string): boolean {
    return this.sessions.has(sessionToken)
  }

  destroySession(sessionToken: string): void {
    this.sessions.delete(sessionToken)
  }
}
