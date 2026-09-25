import { readFileSync, existsSync } from 'fs'
import { join, relative } from 'path'
import type { DiscoveredEndpoint, DiscoveryResult } from './common-types.js'

// Regex-based parser for conventional Lumen route files.
// Does not execute PHP. Reports dynamic registration as gaps.
const ROUTE_RE = /\$router->(get|post|put|patch|delete|options)\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:'([^']+)'|"([^"]+)")/gi
const PREFIX_RE = /\$router->group\s*\(\s*\[.*?'prefix'\s*=>\s*['"]([^'"]+)['"]/gi

export class LumenAdapter {
  async discover(repoRoot: string): Promise<DiscoveryResult> {
    const routeFiles = this.findRouteFiles(repoRoot)
    const endpoints: DiscoveredEndpoint[] = []
    const gaps: string[] = []

    for (const absPath of routeFiles) {
      const content = readFileSync(absPath, 'utf-8')
      const relPath = relative(repoRoot, absPath)
      const prefix = this.extractPrefix(content)
      let match: RegExpExecArray | null

      ROUTE_RE.lastIndex = 0
      while ((match = ROUTE_RE.exec(content)) !== null) {
        const method = match[1].toUpperCase()
        const rawPath = match[2]
        const handler = match[3] ?? match[4] ?? 'closure'
        const normalizedPath = this.normalizePath((prefix ?? '') + '/' + rawPath)
        endpoints.push({
          method,
          path: normalizedPath,
          handler,
          sourceFile: relPath,
          framework: 'lumen',
          diagnostics: []
        })
      }

      if (content.includes('$router->group') && !content.includes("'prefix'")) {
        gaps.push(`${relPath}: group without static prefix — may contain dynamic registration`)
      }
    }

    return { endpoints, gaps }
  }

  private findRouteFiles(root: string): string[] {
    const candidates = [
      join(root, 'routes/web.php'),
      join(root, 'routes/api.php'),
      join(root, 'app/Http/routes.php'),
    ]
    return candidates.filter(existsSync)
  }

  private extractPrefix(content: string): string | null {
    PREFIX_RE.lastIndex = 0
    const m = PREFIX_RE.exec(content)
    return m ? m[1] : null
  }

  private normalizePath(path: string): string {
    return '/' + path.replace(/\/+/g, '/').replace(/^\//, '')
      .replace(/\{(\w+)\??\}/g, '{$1}')
  }
}
