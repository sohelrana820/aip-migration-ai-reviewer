import { describe, it, expect } from 'vitest'
import { RepoService, AccessDeniedError } from '../../src/server/repository/repo-service.js'
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const tmpDir = mkdtempSync(join(tmpdir(), 'amr-repo-'))
const service = new RepoService()

// create test fixture
mkdirSync(join(tmpDir, 'app'))
writeFileSync(join(tmpDir, 'app/test.php'), '<?php echo "hi";')
writeFileSync(join(tmpDir, '.env'), 'SECRET=abc')

describe('RepoService.validateRoot', () => {
  it('accepts an existing directory', () => {
    expect(service.validateRoot(tmpDir).valid).toBe(true)
  })
  it('rejects a non-existent path', () => {
    expect(service.validateRoot('/does/not/exist').valid).toBe(false)
  })
})

describe('RepoService.safeRead', () => {
  it('reads a file within root', () => {
    const content = service.safeRead(tmpDir, 'app/test.php')
    expect(content).toContain('<?php')
  })

  it('throws on path traversal', () => {
    expect(() => service.safeRead(tmpDir, '../etc/passwd')).toThrow(AccessDeniedError)
  })

  it('throws on .env file (excluded by default)', () => {
    expect(() => service.safeRead(tmpDir, '.env')).toThrow(AccessDeniedError)
  })
})

describe('RepoService.listFiles', () => {
  it('lists php files', () => {
    const files = service.listFiles(tmpDir, { extensions: ['.php'] })
    expect(files).toContain('app/test.php')
  })

  it('excludes .env', () => {
    const files = service.listFiles(tmpDir, { extensions: ['.env', '.php'] })
    expect(files).not.toContain('.env')
  })
})
