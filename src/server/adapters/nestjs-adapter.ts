import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import type { DiscoveredEndpoint, DiscoveryResult } from './common-types.js'

const CONTROLLER_RE = /@Controller\s*\(\s*['"`]([^'"`]*)['"`]/
const METHOD_RE = /@(Get|Post|Put|Patch|Delete|Options)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/gi
const CLASS_RE = /export class (\w+)/
const FUNC_RE = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+)?\s*\{/g

export class NestJSAdapter {
  async discover(repoRoot: string): Promise<DiscoveryResult> {
    const endpoints: DiscoveredEndpoint[] = []
    const gaps: string[] = []

    const files = this.findControllerFiles(repoRoot)
    for (const absPath of files) {
      const content = readFileSync(absPath, 'utf-8')
      const relPath = relative(repoRoot, absPath)
      const controllerMatch = CONTROLLER_RE.exec(content)
      if (!controllerMatch) continue

      const classMatch = CLASS_RE.exec(content)
      const className = classMatch?.[1] ?? 'UnknownController'
      const controllerPrefix = controllerMatch[1]

      METHOD_RE.lastIndex = 0
      let mMatch: RegExpExecArray | null
      while ((mMatch = METHOD_RE.exec(content)) !== null) {
        const httpMethod = mMatch[1].toUpperCase()
        const methodPath = mMatch[2] ?? ''
        const handlerName = this.findNextMethodName(content, METHOD_RE.lastIndex)
        const fullPath = this.normalizePath(controllerPrefix + '/' + methodPath)
        endpoints.push({
          method: httpMethod,
          path: fullPath,
          handler: `${className}@${handlerName}`,
          sourceFile: relPath,
          framework: 'nestjs',
          diagnostics: []
        })
      }
    }
    return { endpoints, gaps }
  }

  private findControllerFiles(root: string): string[] {
    const results: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue
          walk(fullPath)
        } else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
          results.push(fullPath)
        }
      }
    }
    walk(root)
    return results
  }

  private findNextMethodName(content: string, fromIndex: number): string {
    FUNC_RE.lastIndex = fromIndex
    const m = FUNC_RE.exec(content)
    return m ? m[1] : 'unknown'
  }

  private normalizePath(path: string): string {
    return '/' + path.replace(/\/+/g, '/').replace(/^\//, '')
      .replace(/:(\w+)/g, '{$1}')
  }
}
