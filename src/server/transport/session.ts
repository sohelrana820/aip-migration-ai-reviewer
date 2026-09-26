import { randomBytes } from 'crypto'

export class SessionManager {
  private bootstrapToken: string | null = null
  private bootstrapExpiry: number = 0
  private sessions = new Set<string>()

  generateBootstrapCredential(): { token: string; expiresAt: Date } {
    this.bootstrapToken = randomBytes(32).toString('hex')
    this.bootstrapExpiry = Date.now() + 300_000
    return { token: this.bootstrapToken, expiresAt: new Date(this.bootstrapExpiry) }
  }

  createSession(bootstrapToken: string): { sessionToken: string } | null {
    if (!this.bootstrapToken || bootstrapToken !== this.bootstrapToken) return null
    if (Date.now() > this.bootstrapExpiry) {
      this.bootstrapToken = null
      return null
    }
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
