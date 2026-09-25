import { describe, it, expect, beforeEach } from 'vitest'
import { SessionManager } from '../../src/server/transport/session.js'

let manager: SessionManager

beforeEach(() => { manager = new SessionManager() })

describe('SessionManager', () => {
  it('issues a bootstrap credential', () => {
    const { token } = manager.generateBootstrapCredential()
    expect(token).toHaveLength(64)
  })

  it('exchanges bootstrap for session token', () => {
    const { token: bootstrap } = manager.generateBootstrapCredential()
    const result = manager.createSession(bootstrap)
    expect(result).not.toBeNull()
    expect(result!.sessionToken).toHaveLength(64)
  })

  it('rejects bootstrap token reuse', () => {
    const { token: bootstrap } = manager.generateBootstrapCredential()
    manager.createSession(bootstrap)
    const second = manager.createSession(bootstrap)
    expect(second).toBeNull()
  })

  it('validates a session token', () => {
    const { token: bootstrap } = manager.generateBootstrapCredential()
    const { sessionToken } = manager.createSession(bootstrap)!
    expect(manager.validateSession(sessionToken)).toBe(true)
  })

  it('rejects an invalid session token', () => {
    expect(manager.validateSession('bad-token')).toBe(false)
  })

  it('destroys a session', () => {
    const { token: bootstrap } = manager.generateBootstrapCredential()
    const { sessionToken } = manager.createSession(bootstrap)!
    manager.destroySession(sessionToken)
    expect(manager.validateSession(sessionToken)).toBe(false)
  })
})
