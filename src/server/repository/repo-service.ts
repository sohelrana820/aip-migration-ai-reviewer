import { existsSync, statSync, readFileSync, readdirSync } from 'fs'
import { resolve, join, extname } from 'path'

export class AccessDeniedError extends Error {
  constructor(msg: string) { super(msg); this.name = 'AccessDeniedError' }
}

const EXCLUDED_NAMES = new Set(['.env', '.env.local', '.env.production'])
const EXCLUDED_DIRS = new Set(['node_modules', 'vendor', '.git', 'storage/logs', 'bootstrap/cache'])
const EXCLUDED_EXTENSIONS = new Set(['.log', '.key', '.pem', '.p12', '.pfx'])

export interface ListOptions {
  extensions: string[]
  maxFiles?: number
}

export class RepoService {
  validateRoot(p: string): { valid: boolean; error?: string } {
    try {
      const resolved = resolve(p)
      if (!existsSync(resolved)) return { valid: false, error: 'Path does not exist' }
      if (!statSync(resolved).isDirectory()) return { valid: false, error: 'Path is not a directory' }
      return { valid: true }
    } catch (e) {
      return { valid: false, error: String(e) }
    }
  }

  safeRead(root: string, relativePath: string): string {
    const resolvedRoot = resolve(root)
    const resolvedFile = resolve(join(resolvedRoot, relativePath))

    if (!resolvedFile.startsWith(resolvedRoot + '/') && resolvedFile !== resolvedRoot) {
      throw new AccessDeniedError(`Path escapes root: ${relativePath}`)
    }

    const basename = resolvedFile.split('/').pop() ?? ''
    if (EXCLUDED_NAMES.has(basename)) throw new AccessDeniedError(`File is excluded: ${basename}`)
    if (EXCLUDED_EXTENSIONS.has(extname(basename))) throw new AccessDeniedError(`Extension excluded: ${extname(basename)}`)

    return readFileSync(resolvedFile, 'utf-8')
  }

  listFiles(root: string, options: ListOptions, _subdir = ''): string[] {
    const resolvedRoot = resolve(root)
    const absDir = join(resolvedRoot, _subdir)
    const results: string[] = []

    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue
        results.push(...this.listFiles(root, options, join(_subdir, entry.name)))
      } else if (entry.isFile()) {
        const relPath = join(_subdir, entry.name)
        const ext = extname(entry.name)
        if (EXCLUDED_NAMES.has(entry.name)) continue
        if (options.extensions.includes(ext)) results.push(relPath)
        if (options.maxFiles && results.length >= options.maxFiles) break
      }
    }
    return results
  }
}
