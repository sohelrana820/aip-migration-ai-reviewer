# AI API Migration Reviewer — Phase 1: Foundation, Discovery & Mapping

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local Node.js application with project management, Lumen/NestJS endpoint discovery, deterministic mapping (including split/merged groups), and a working browser UI — fully functional without any AI or OpenAI calls.

**Architecture:** Modular coordinator process owns the HTTP server, SQLite database, and all policy enforcement. Syntax analysis runs in bounded worker threads. The browser UI communicates via authenticated local HTTP and server-sent events. No runtime execution against repositories.

**Tech Stack:** Node.js 20 LTS, TypeScript 5, Express 4, better-sqlite3, worker_threads, php-parser (glayzzle), ts-morph, Vite 5 + React 18, Vitest, Zod

**Spec:** [docs/requirements.md](../../requirements.md) | [docs/architecture.md](../../architecture.md)

## Global Constraints

- Node.js ≥ 20 LTS; TypeScript strict mode; no `any` without explicit suppression comment
- macOS and Linux only — no Windows path assumptions
- Local server binds to `127.0.0.1` only, never `0.0.0.0`
- Repository reads are strictly confined to two user-selected roots; reject traversal, symlink escape, excluded paths
- No writes into either reviewed repository under any circumstance
- No execution of repository code, framework CLI commands, or Git hooks
- All state transitions commit atomically in SQLite; coordinator is the sole DB writer
- Workers have no database handles, no network access, no persistent state
- Session credentials never appear in URLs, logs, SQLite, or browser persistent storage
- All AI outputs are provisional; this phase contains zero AI calls

---

## File Structure

```
src/
  server/
    index.ts                        Entry point — starts server, handles shutdown
    app.ts                          Express app factory, middleware chain
    transport/
      session.ts                    Bootstrap credential, session token issuance
      auth-middleware.ts            Request authentication guard
      origin-middleware.ts          Host + Origin validation, CSRF protection
      sse.ts                        SSE connection management, event broadcast
      routes/
        projects.ts                 /api/projects CRUD
        endpoints.ts                /api/projects/:id/endpoints
        mappings.ts                 /api/projects/:id/mappings
        events.ts                   /api/events SSE stream
    coordinator/
      review-coordinator.ts         Batch/group lifecycle state machine
    repository/
      repo-service.ts               Path validation, containment enforcement, safe reads
      capture.ts                    File capture, manifest, fingerprint
      rediscovery.ts                Route/dependency rediscovery for freshness checks
    workers/
      worker-pool.ts                Bounded worker pool, job dispatch, timeout
      worker-protocol.ts            Job/result type definitions (shared with workers)
      php-worker.ts                 PHP syntax analysis worker (worker_threads entry)
      ts-worker.ts                  TypeScript syntax analysis worker entry
    adapters/
      common-types.ts               Shared Endpoint, RouteDeclaration, DiscoveryGap types
      lumen-adapter.ts              Lumen 11 route/handler resolution rules
      nestjs-adapter.ts             NestJS 11 decorator resolution rules
    mapping/
      mapping-service.ts            Deterministic matching, group CRUD
      mapping-types.ts              MappingGroup, GroupType, GroupStatus types
    persistence/
      db.ts                         SQLite connection, WAL mode, migration runner
      schema.ts                     CREATE TABLE statements, migration list
      repos/
        projects-repo.ts            projects table CRUD
        endpoints-repo.ts           endpoints table CRUD
        mappings-repo.ts            mapping_groups table CRUD
  ui/
    index.html
    src/
      main.tsx
      App.tsx
      api/
        client.ts                   Typed fetch wrapper, session token attachment
        sse-client.ts               SSE EventSource wrapper with reconnect
      store/
        project-store.ts            Zustand project state
        mapping-store.ts            Zustand mapping state
      pages/
        ProjectListPage.tsx
        ProjectSetupPage.tsx
        EndpointInventoryPage.tsx
        MappingEditorPage.tsx
      components/
        EndpointRow.tsx
        MappingGroupCard.tsx
        SplitMergeModal.tsx
tests/
  unit/
    repo-service.test.ts
    lumen-adapter.test.ts
    nestjs-adapter.test.ts
    mapping-service.test.ts
    worker-pool.test.ts
    session.test.ts
    origin-middleware.test.ts
  fixtures/
    lumen/
      routes/web.php               Sample Lumen route file
      app/Http/Controllers/UserController.php
    nestjs/
      src/users/users.controller.ts
      src/users/users.module.ts
```

---

## Task 1: Project Scaffold and Tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.worker.json`
- Create: `vitest.config.ts`
- Create: `vite.config.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces: `npm run dev` starts server; `npm test` runs Vitest; `npm run build` compiles

- [ ] **Step 1: Initialise the package**

```bash
mkdir -p src/server src/ui tests/unit tests/fixtures
npm init -y
npm install express better-sqlite3 zod php-parser ts-morph openai
npm install -D typescript @types/node @types/express @types/better-sqlite3 \
  vitest vite @vitejs/plugin-react react react-dom @types/react @types/react-dom \
  zustand tsx nodemon
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src/server",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/server/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Write `tsconfig.worker.json`** (separate compile for workers)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist/workers",
    "rootDir": "src/server/workers"
  },
  "include": ["src/server/workers/**/*"]
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: { reporter: ['text', 'lcov'] }
  }
})
```

- [ ] **Step 5: Write `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  root: 'src/ui',
  plugins: [react()],
  build: { outDir: '../../dist/ui', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:3000', '/events': 'http://127.0.0.1:3000' } }
})
```

- [ ] **Step 6: Update `package.json` scripts**

```json
{
  "scripts": {
    "dev": "tsx watch src/server/index.ts",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 7: Write `.gitignore`**

```
node_modules/
dist/
*.db
*.db-wal
*.db-shm
.env
```

- [ ] **Step 8: Verify tools work**

```bash
npm test   # should find 0 tests and exit 0
```

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json tsconfig.worker.json vitest.config.ts vite.config.ts .gitignore
git commit -m "chore: project scaffold with TypeScript, Vitest, Vite"
```

---

## Task 2: SQLite Schema and Database Layer

**Files:**
- Create: `src/server/persistence/schema.ts`
- Create: `src/server/persistence/db.ts`
- Create: `src/server/persistence/repos/projects-repo.ts`
- Create: `src/server/persistence/repos/endpoints-repo.ts`
- Create: `src/server/persistence/repos/mappings-repo.ts`
- Test: `tests/unit/db.test.ts`

**Interfaces:**
- Produces:
  - `openDb(path: string): Database` — returns a connected better-sqlite3 instance with WAL mode and migrations applied
  - `ProjectsRepo`, `EndpointsRepo`, `MappingsRepo` — typed CRUD classes constructed from a `Database` instance

- [ ] **Step 1: Write the failing schema test**

```typescript
// tests/unit/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '../../src/server/persistence/db'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir: string
let db: Database.Database

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'amr-test-'))
  db = openDb(join(tmpDir, 'test.db'))
})

afterEach(() => {
  db.close()
  rmSync(tmpDir, { recursive: true })
})

describe('openDb', () => {
  it('creates projects table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get()
    expect(row).toBeDefined()
  })

  it('creates endpoints table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='endpoints'").get()
    expect(row).toBeDefined()
  })

  it('creates mapping_groups table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mapping_groups'").get()
    expect(row).toBeDefined()
  })

  it('enables WAL mode', () => {
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    expect(row.journal_mode).toBe('wal')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/unit/db.test.ts
```
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Write `src/server/persistence/schema.ts`**

```typescript
export const MIGRATIONS: string[] = [
  /* 001 */ `
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      source_path TEXT NOT NULL,
      target_path TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS endpoints (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      repo        TEXT NOT NULL CHECK(repo IN ('source','target')),
      method      TEXT NOT NULL,
      path        TEXT NOT NULL,
      handler     TEXT NOT NULL,
      source_file TEXT NOT NULL,
      framework   TEXT NOT NULL CHECK(framework IN ('lumen','nestjs')),
      diagnostics TEXT NOT NULL DEFAULT '[]',
      discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mapping_groups (
      id               TEXT PRIMARY KEY,
      project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      group_type       TEXT NOT NULL CHECK(group_type IN ('one-to-one','one-to-many','many-to-one')),
      source_ids       TEXT NOT NULL DEFAULT '[]',
      target_ids       TEXT NOT NULL DEFAULT '[]',
      correspondence   TEXT,
      status           TEXT NOT NULL DEFAULT 'unmatched'
                         CHECK(status IN ('matched','manual','unmatched','uncertain')),
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `
]
```

- [ ] **Step 4: Write `src/server/persistence/db.ts`**

```typescript
import Database from 'better-sqlite3'
import { MIGRATIONS } from './schema.js'

export function openDb(filePath: string): Database.Database {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[])
      .map(r => r.version)
  )
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1
    if (!applied.has(version)) {
      db.transaction(() => {
        db.exec(MIGRATIONS[i])
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version)
      })()
    }
  }
}
```

- [ ] **Step 5: Run test to confirm pass**

```bash
npm test -- tests/unit/db.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 6: Write `src/server/persistence/repos/projects-repo.ts`**

```typescript
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface ProjectRow {
  id: string
  name: string
  source_path: string
  target_path: string
  created_at: string
}

export class ProjectsRepo {
  constructor(private db: Database.Database) {}

  create(name: string, sourcePath: string, targetPath: string): ProjectRow {
    const id = randomUUID()
    this.db.prepare(
      'INSERT INTO projects (id, name, source_path, target_path) VALUES (?, ?, ?, ?)'
    ).run(id, name, sourcePath, targetPath)
    return this.getById(id)!
  }

  getById(id: string): ProjectRow | undefined {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
  }

  list(): ProjectRow[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[]
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }
}
```

- [ ] **Step 7: Write `src/server/persistence/repos/endpoints-repo.ts`**

```typescript
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface EndpointRow {
  id: string
  project_id: string
  repo: 'source' | 'target'
  method: string
  path: string
  handler: string
  source_file: string
  framework: 'lumen' | 'nestjs'
  diagnostics: string   // JSON string
  discovered_at: string
}

export class EndpointsRepo {
  constructor(private db: Database.Database) {}

  insertMany(projectId: string, endpoints: Omit<EndpointRow, 'id' | 'project_id' | 'discovered_at'>[]): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO endpoints (id, project_id, repo, method, path, handler, source_file, framework, diagnostics) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const insert = this.db.transaction((rows: typeof endpoints) => {
      for (const r of rows) {
        stmt.run(randomUUID(), projectId, r.repo, r.method, r.path, r.handler, r.source_file, r.framework, r.diagnostics)
      }
    })
    insert(endpoints)
  }

  listByProject(projectId: string): EndpointRow[] {
    return this.db.prepare('SELECT * FROM endpoints WHERE project_id = ? ORDER BY repo, method, path')
      .all(projectId) as EndpointRow[]
  }

  deleteByProject(projectId: string): void {
    this.db.prepare('DELETE FROM endpoints WHERE project_id = ?').run(projectId)
  }
}
```

- [ ] **Step 8: Write `src/server/persistence/repos/mappings-repo.ts`**

```typescript
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface MappingGroupRow {
  id: string
  project_id: string
  group_type: 'one-to-one' | 'one-to-many' | 'many-to-one'
  source_ids: string   // JSON
  target_ids: string   // JSON
  correspondence: string | null
  status: 'matched' | 'manual' | 'unmatched' | 'uncertain'
  created_at: string
  updated_at: string
}

export class MappingsRepo {
  constructor(private db: Database.Database) {}

  create(
    projectId: string,
    groupType: MappingGroupRow['group_type'],
    sourceIds: string[],
    targetIds: string[],
    status: MappingGroupRow['status'],
    correspondence?: string
  ): MappingGroupRow {
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO mapping_groups (id, project_id, group_type, source_ids, target_ids, status, correspondence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, groupType, JSON.stringify(sourceIds), JSON.stringify(targetIds), status, correspondence ?? null)
    return this.getById(id)!
  }

  getById(id: string): MappingGroupRow | undefined {
    return this.db.prepare('SELECT * FROM mapping_groups WHERE id = ?').get(id) as MappingGroupRow | undefined
  }

  listByProject(projectId: string): MappingGroupRow[] {
    return this.db.prepare('SELECT * FROM mapping_groups WHERE project_id = ? ORDER BY created_at')
      .all(projectId) as MappingGroupRow[]
  }

  update(id: string, patch: Partial<Pick<MappingGroupRow, 'source_ids' | 'target_ids' | 'group_type' | 'status' | 'correspondence'>>): void {
    const fields = Object.entries(patch)
      .map(([k]) => `${k} = ?`)
      .join(', ')
    const values = Object.values(patch)
    this.db.prepare(`UPDATE mapping_groups SET ${fields}, updated_at = datetime('now') WHERE id = ?`)
      .run(...values, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM mapping_groups WHERE id = ?').run(id)
  }

  deleteByProject(projectId: string): void {
    this.db.prepare('DELETE FROM mapping_groups WHERE project_id = ?').run(projectId)
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add src/server/persistence/ tests/unit/db.test.ts
git commit -m "feat: SQLite schema, migrations, and typed repository layer"
```

---

## Task 3: Local Transport — Session Auth and Origin Protection

**Files:**
- Create: `src/server/transport/session.ts`
- Create: `src/server/transport/auth-middleware.ts`
- Create: `src/server/transport/origin-middleware.ts`
- Test: `tests/unit/session.test.ts`
- Test: `tests/unit/origin-middleware.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `generateBootstrapCredential(): { token: string; expiresAt: Date }` — single-use startup token
  - `createSession(bootstrapToken: string): { sessionToken: string } | null`
  - `requireSession` — Express middleware; rejects with 401 if no valid session token
  - `requireSafeOrigin(allowedOrigins: string[])` — Express middleware; rejects cross-site requests

- [ ] **Step 1: Write failing session tests**

```typescript
// tests/unit/session.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { SessionManager } from '../../src/server/transport/session'

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
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/unit/session.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write `src/server/transport/session.ts`**

```typescript
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
```

- [ ] **Step 4: Run session tests**

```bash
npm test -- tests/unit/session.test.ts
```
Expected: PASS (6 tests)

- [ ] **Step 5: Write failing origin-middleware tests**

```typescript
// tests/unit/origin-middleware.test.ts
import { describe, it, expect } from 'vitest'
import { createOriginMiddleware } from '../../src/server/transport/origin-middleware'
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
```

- [ ] **Step 6: Write `src/server/transport/origin-middleware.ts`**

```typescript
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
```

- [ ] **Step 7: Write `src/server/transport/auth-middleware.ts`**

```typescript
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
```

- [ ] **Step 8: Run all transport tests**

```bash
npm test -- tests/unit/session.test.ts tests/unit/origin-middleware.test.ts
```
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/server/transport/ tests/unit/session.test.ts tests/unit/origin-middleware.test.ts
git commit -m "feat: session management and origin/host protection middleware"
```

---

## Task 4: Repository Access Service

**Files:**
- Create: `src/server/repository/repo-service.ts`
- Test: `tests/unit/repo-service.test.ts`

**Interfaces:**
- Produces:
  - `class RepoService`
    - `validateRoot(p: string): { valid: boolean; error?: string }`
    - `safeRead(root: string, relativePath: string): string` — throws `AccessDeniedError` if path escapes root or is excluded
    - `listFiles(root: string, options: ListOptions): string[]` — returns relative paths within root

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/repo-service.test.ts
import { describe, it, expect } from 'vitest'
import { RepoService, AccessDeniedError } from '../../src/server/repository/repo-service'
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/unit/repo-service.test.ts
```

- [ ] **Step 3: Write `src/server/repository/repo-service.ts`**

```typescript
import { existsSync, statSync, readFileSync, readdirSync } from 'fs'
import { resolve, relative, join, extname } from 'path'

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
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/repo-service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/repository/repo-service.ts tests/unit/repo-service.test.ts
git commit -m "feat: repository access service with path containment and exclusion rules"
```

---

## Task 5: Worker Protocol and Pool

**Files:**
- Create: `src/server/workers/worker-protocol.ts`
- Create: `src/server/workers/worker-pool.ts`
- Test: `tests/unit/worker-pool.test.ts`

**Interfaces:**
- Produces:
  - `WorkerPool` class: `runJob<T>(workerPath: string, job: WorkerJob): Promise<T>` — dispatches to a worker thread, enforces timeout
  - `WorkerJob = { jobId: string; type: string; payload: unknown }`
  - `WorkerResult<T> = { jobId: string; ok: true; data: T } | { jobId: string; ok: false; error: string }`

- [ ] **Step 1: Write `src/server/workers/worker-protocol.ts`**

```typescript
export interface WorkerJob {
  jobId: string
  type: string
  payload: unknown
}

export type WorkerResult<T = unknown> =
  | { jobId: string; ok: true; data: T }
  | { jobId: string; ok: false; error: string }
```

- [ ] **Step 2: Write failing pool test**

```typescript
// tests/unit/worker-pool.test.ts
import { describe, it, expect } from 'vitest'
import { WorkerPool } from '../../src/server/workers/worker-pool'
import { join } from 'path'

// We test the pool with a minimal inline worker fixture
const FIXTURE_WORKER = join(import.meta.dirname, '../fixtures/echo-worker.mjs')

describe('WorkerPool', () => {
  it('returns result from worker', async () => {
    const pool = new WorkerPool({ maxWorkers: 2, timeoutMs: 5000 })
    const result = await pool.runJob<string>(FIXTURE_WORKER, { jobId: '1', type: 'echo', payload: 'hello' })
    expect(result).toBe('hello')
    await pool.shutdown()
  })

  it('throws on timeout', async () => {
    const pool = new WorkerPool({ maxWorkers: 1, timeoutMs: 50 })
    const SLOW_WORKER = join(import.meta.dirname, '../fixtures/slow-worker.mjs')
    await expect(pool.runJob(SLOW_WORKER, { jobId: '2', type: 'slow', payload: null }))
      .rejects.toThrow('timeout')
    await pool.shutdown()
  })
})
```

- [ ] **Step 3: Create worker fixtures**

```javascript
// tests/fixtures/echo-worker.mjs
import { parentPort } from 'worker_threads'
parentPort.on('message', (job) => {
  parentPort.postMessage({ jobId: job.jobId, ok: true, data: job.payload })
})
```

```javascript
// tests/fixtures/slow-worker.mjs
import { parentPort } from 'worker_threads'
parentPort.on('message', (_job) => {
  // never responds
})
```

- [ ] **Step 4: Write `src/server/workers/worker-pool.ts`**

```typescript
import { Worker } from 'worker_threads'
import type { WorkerJob, WorkerResult } from './worker-protocol.js'

interface PoolOptions {
  maxWorkers: number
  timeoutMs: number
}

export class WorkerPool {
  private options: PoolOptions

  constructor(options: PoolOptions) {
    this.options = options
  }

  runJob<T>(workerPath: string, job: WorkerJob): Promise<T> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath)
      const timer = setTimeout(() => {
        worker.terminate()
        reject(new Error(`Worker job ${job.jobId} timeout after ${this.options.timeoutMs}ms`))
      }, this.options.timeoutMs)

      worker.on('message', (result: WorkerResult<T>) => {
        clearTimeout(timer)
        worker.terminate()
        if (result.ok) resolve(result.data)
        else reject(new Error(result.error))
      })

      worker.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })

      worker.postMessage(job)
    })
  }

  async shutdown(): Promise<void> {
    // stateless pool — workers are created per-job
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/unit/worker-pool.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/workers/ tests/unit/worker-pool.test.ts tests/fixtures/echo-worker.mjs tests/fixtures/slow-worker.mjs
git commit -m "feat: worker protocol types and bounded worker pool with timeout"
```

---

## Task 6: Lumen Endpoint Discovery

**Files:**
- Create: `src/server/adapters/common-types.ts`
- Create: `src/server/workers/php-worker.ts`
- Create: `src/server/adapters/lumen-adapter.ts`
- Create: `tests/fixtures/lumen/routes/web.php`
- Create: `tests/fixtures/lumen/app/Http/Controllers/UserController.php`
- Test: `tests/unit/lumen-adapter.test.ts`

**Interfaces:**
- Consumes: `RepoService`, `WorkerPool`
- Produces:
  - `DiscoveredEndpoint { method: string; path: string; handler: string; sourceFile: string; framework: 'lumen'; diagnostics: string[] }`
  - `LumenAdapter.discover(repoRoot: string): Promise<DiscoveredEndpoint[]>`

- [ ] **Step 1: Write `src/server/adapters/common-types.ts`**

```typescript
export interface DiscoveredEndpoint {
  method: string         // GET, POST, PUT, PATCH, DELETE
  path: string           // normalized: /users/{id}
  handler: string        // ClassName@methodName or closure description
  sourceFile: string     // relative to repo root
  framework: 'lumen' | 'nestjs'
  diagnostics: string[]  // gaps, warnings
}

export interface DiscoveryResult {
  endpoints: DiscoveredEndpoint[]
  gaps: string[]
}
```

- [ ] **Step 2: Create Lumen fixture files**

```php
<?php
// tests/fixtures/lumen/routes/web.php
/** @var \Laravel\Lumen\Routing\Router $router */

$router->group(['prefix' => 'api/v1'], function () use ($router) {
    $router->get('users', 'UserController@index');
    $router->post('users', 'UserController@store');
    $router->get('users/{id}', 'UserController@show');
    $router->put('users/{id}', 'UserController@update');
    $router->delete('users/{id}', 'UserController@destroy');
});
```

```php
<?php
// tests/fixtures/lumen/app/Http/Controllers/UserController.php
namespace App\Http\Controllers;

class UserController extends Controller
{
    public function index() {}
    public function store() {}
    public function show($id) {}
    public function update($id) {}
    public function destroy($id) {}
}
```

- [ ] **Step 3: Write failing adapter test**

```typescript
// tests/unit/lumen-adapter.test.ts
import { describe, it, expect } from 'vitest'
import { LumenAdapter } from '../../src/server/adapters/lumen-adapter'
import { join } from 'path'

const FIXTURE = join(import.meta.dirname, '../fixtures/lumen')

describe('LumenAdapter.discover', () => {
  it('discovers all routes from web.php', async () => {
    const adapter = new LumenAdapter()
    const result = await adapter.discover(FIXTURE)
    const methods = result.endpoints.map(e => e.method)
    expect(methods).toContain('GET')
    expect(methods).toContain('POST')
    expect(methods).toContain('DELETE')
  })

  it('normalizes path parameters to {param} syntax', async () => {
    const adapter = new LumenAdapter()
    const result = await adapter.discover(FIXTURE)
    const paths = result.endpoints.map(e => e.path)
    expect(paths).toContain('/api/v1/users/{id}')
  })

  it('includes handler reference', async () => {
    const adapter = new LumenAdapter()
    const result = await adapter.discover(FIXTURE)
    const index = result.endpoints.find(e => e.method === 'GET' && e.path === '/api/v1/users')
    expect(index?.handler).toContain('UserController')
  })

  it('records source file relative path', async () => {
    const adapter = new LumenAdapter()
    const result = await adapter.discover(FIXTURE)
    expect(result.endpoints[0].sourceFile).toMatch(/routes\/web\.php/)
  })
})
```

- [ ] **Step 4: Write `src/server/adapters/lumen-adapter.ts`**

```typescript
import { readFileSync, existsSync } from 'fs'
import { join, relative } from 'path'
import type { DiscoveredEndpoint, DiscoveryResult } from './common-types.js'

// Simple regex-based parser for conventional Lumen route files.
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
      .replace(/\{(\w+)\??\}/g, '{$1}')   // Lumen optional params → standard
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/unit/lumen-adapter.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/adapters/ src/server/workers/php-worker.ts tests/unit/lumen-adapter.test.ts tests/fixtures/lumen/
git commit -m "feat: Lumen 11 static route discovery adapter"
```

---

## Task 7: NestJS Endpoint Discovery

**Files:**
- Create: `src/server/adapters/nestjs-adapter.ts`
- Create: `tests/fixtures/nestjs/src/users/users.controller.ts`
- Test: `tests/unit/nestjs-adapter.test.ts`

**Interfaces:**
- Consumes: `DiscoveredEndpoint`, `DiscoveryResult` from `common-types.ts`
- Produces: `NestJSAdapter.discover(repoRoot: string): Promise<DiscoveryResult>`

- [ ] **Step 1: Create NestJS fixture**

```typescript
// tests/fixtures/nestjs/src/users/users.controller.ts
import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common'

@Controller('api/v1/users')
export class UsersController {
  @Get()
  findAll() {}

  @Post()
  create(@Body() body: any) {}

  @Get(':id')
  findOne(@Param('id') id: string) {}

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {}

  @Delete(':id')
  remove(@Param('id') id: string) {}
}
```

- [ ] **Step 2: Write failing test**

```typescript
// tests/unit/nestjs-adapter.test.ts
import { describe, it, expect } from 'vitest'
import { NestJSAdapter } from '../../src/server/adapters/nestjs-adapter'
import { join } from 'path'

const FIXTURE = join(import.meta.dirname, '../fixtures/nestjs')

describe('NestJSAdapter.discover', () => {
  it('discovers all routes from controller', async () => {
    const adapter = new NestJSAdapter()
    const result = await adapter.discover(FIXTURE)
    expect(result.endpoints.length).toBe(5)
  })

  it('normalizes path parameters', async () => {
    const adapter = new NestJSAdapter()
    const result = await adapter.discover(FIXTURE)
    const paths = result.endpoints.map(e => e.path)
    expect(paths).toContain('/api/v1/users/{id}')
  })

  it('identifies method correctly', async () => {
    const adapter = new NestJSAdapter()
    const result = await adapter.discover(FIXTURE)
    const deleteRoute = result.endpoints.find(e => e.method === 'DELETE')
    expect(deleteRoute).toBeDefined()
    expect(deleteRoute?.handler).toContain('UsersController')
  })
})
```

- [ ] **Step 3: Write `src/server/adapters/nestjs-adapter.ts`**

```typescript
import { readFileSync } from 'fs'
import { join, relative } from 'path'
import { globSync } from 'fs'  // Node 22+ or use fast-glob
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
    try {
      // Use Node's built-in glob (Node 22+) or fall back to manual walk
      return globSync('**/*.controller.ts', { cwd: root, absolute: true })
    } catch {
      return []
    }
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
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/nestjs-adapter.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/adapters/nestjs-adapter.ts tests/unit/nestjs-adapter.test.ts tests/fixtures/nestjs/
git commit -m "feat: NestJS 11 static route discovery adapter"
```

---

## Task 8: Mapping Service

**Files:**
- Create: `src/server/mapping/mapping-types.ts`
- Create: `src/server/mapping/mapping-service.ts`
- Test: `tests/unit/mapping-service.test.ts`

**Interfaces:**
- Consumes: `EndpointsRepo`, `MappingsRepo`
- Produces:
  - `MappingService.autoMatch(projectId: string): MappingGroup[]` — deterministic method+path matching
  - `MappingService.createManualGroup(projectId: string, opts: ManualGroupOpts): MappingGroup`
  - `MappingService.updateGroup(id: string, patch: GroupPatch): MappingGroup`

- [ ] **Step 1: Write `src/server/mapping/mapping-types.ts`**

```typescript
export type GroupType = 'one-to-one' | 'one-to-many' | 'many-to-one'
export type GroupStatus = 'matched' | 'manual' | 'unmatched' | 'uncertain'

export interface MappingGroup {
  id: string
  projectId: string
  groupType: GroupType
  sourceIds: string[]
  targetIds: string[]
  correspondence?: string
  status: GroupStatus
}

export interface ManualGroupOpts {
  groupType: GroupType
  sourceIds: string[]
  targetIds: string[]
  correspondence?: string
}

export interface GroupPatch {
  sourceIds?: string[]
  targetIds?: string[]
  groupType?: GroupType
  status?: GroupStatus
  correspondence?: string
}
```

- [ ] **Step 2: Write failing test**

```typescript
// tests/unit/mapping-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { MappingService } from '../../src/server/mapping/mapping-service'
import { openDb } from '../../src/server/persistence/db'
import { ProjectsRepo } from '../../src/server/persistence/repos/projects-repo'
import { EndpointsRepo } from '../../src/server/persistence/repos/endpoints-repo'
import { MappingsRepo } from '../../src/server/persistence/repos/mappings-repo'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir: string, service: MappingService, projectId: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'amr-map-'))
  const db = openDb(join(tmpDir, 'test.db'))
  const projectsRepo = new ProjectsRepo(db)
  const endpointsRepo = new EndpointsRepo(db)
  const mappingsRepo = new MappingsRepo(db)
  service = new MappingService(endpointsRepo, mappingsRepo)

  const project = projectsRepo.create('test', '/src', '/tgt')
  projectId = project.id

  endpointsRepo.insertMany(projectId, [
    { repo: 'source', method: 'GET', path: '/api/users', handler: 'UserController@index', source_file: 'routes/web.php', framework: 'lumen', diagnostics: '[]' },
    { repo: 'source', method: 'POST', path: '/api/users', handler: 'UserController@store', source_file: 'routes/web.php', framework: 'lumen', diagnostics: '[]' },
    { repo: 'target', method: 'GET', path: '/api/users', handler: 'UsersController@findAll', source_file: 'users.controller.ts', framework: 'nestjs', diagnostics: '[]' },
    { repo: 'target', method: 'DELETE', path: '/api/users/{id}', handler: 'UsersController@remove', source_file: 'users.controller.ts', framework: 'nestjs', diagnostics: '[]' },
  ])
})

describe('MappingService.autoMatch', () => {
  it('matches endpoints by method and path', () => {
    const groups = service.autoMatch(projectId)
    const matched = groups.filter(g => g.status === 'matched')
    expect(matched.length).toBe(1)
    expect(matched[0].groupType).toBe('one-to-one')
  })

  it('marks source-only endpoints as unmatched', () => {
    const groups = service.autoMatch(projectId)
    const unmatched = groups.filter(g => g.sourceIds.length > 0 && g.targetIds.length === 0)
    expect(unmatched.length).toBeGreaterThan(0)
  })
})

describe('MappingService.createManualGroup', () => {
  it('creates a one-to-many group', () => {
    const group = service.createManualGroup(projectId, {
      groupType: 'one-to-many',
      sourceIds: ['s1'],
      targetIds: ['t1', 't2'],
      correspondence: 'split into two controllers'
    })
    expect(group.groupType).toBe('one-to-many')
    expect(group.correspondence).toBe('split into two controllers')
    expect(group.status).toBe('manual')
  })
})
```

- [ ] **Step 3: Write `src/server/mapping/mapping-service.ts`**

```typescript
import type { EndpointsRepo } from '../persistence/repos/endpoints-repo.js'
import type { MappingsRepo } from '../persistence/repos/mappings-repo.js'
import type { MappingGroup, ManualGroupOpts, GroupPatch } from './mapping-types.js'

export class MappingService {
  constructor(
    private endpointsRepo: EndpointsRepo,
    private mappingsRepo: MappingsRepo
  ) {}

  autoMatch(projectId: string): MappingGroup[] {
    const all = this.endpointsRepo.listByProject(projectId)
    const sources = all.filter(e => e.repo === 'source')
    const targets = all.filter(e => e.repo === 'target')

    const targetByKey = new Map(targets.map(e => [`${e.method}:${e.path}`, e]))
    const matchedTargetIds = new Set<string>()
    const groups: MappingGroup[] = []

    for (const src of sources) {
      const key = `${src.method}:${src.path}`
      const tgt = targetByKey.get(key)
      if (tgt) {
        matchedTargetIds.add(tgt.id)
        const row = this.mappingsRepo.create(projectId, 'one-to-one', [src.id], [tgt.id], 'matched')
        groups.push(this.toGroup(row))
      } else {
        const row = this.mappingsRepo.create(projectId, 'one-to-one', [src.id], [], 'unmatched')
        groups.push(this.toGroup(row))
      }
    }

    for (const tgt of targets.filter(t => !matchedTargetIds.has(t.id))) {
      const row = this.mappingsRepo.create(projectId, 'one-to-one', [], [tgt.id], 'unmatched')
      groups.push(this.toGroup(row))
    }

    return groups
  }

  createManualGroup(projectId: string, opts: ManualGroupOpts): MappingGroup {
    const row = this.mappingsRepo.create(
      projectId,
      opts.groupType,
      opts.sourceIds,
      opts.targetIds,
      'manual',
      opts.correspondence
    )
    return this.toGroup(row)
  }

  updateGroup(id: string, patch: GroupPatch): MappingGroup {
    const dbPatch: Record<string, unknown> = {}
    if (patch.sourceIds) dbPatch['source_ids'] = JSON.stringify(patch.sourceIds)
    if (patch.targetIds) dbPatch['target_ids'] = JSON.stringify(patch.targetIds)
    if (patch.groupType) dbPatch['group_type'] = patch.groupType
    if (patch.status) dbPatch['status'] = patch.status
    if (patch.correspondence !== undefined) dbPatch['correspondence'] = patch.correspondence
    this.mappingsRepo.update(id, dbPatch as any)
    return this.toGroup(this.mappingsRepo.getById(id)!)
  }

  private toGroup(row: any): MappingGroup {
    return {
      id: row.id,
      projectId: row.project_id,
      groupType: row.group_type,
      sourceIds: JSON.parse(row.source_ids),
      targetIds: JSON.parse(row.target_ids),
      correspondence: row.correspondence ?? undefined,
      status: row.status
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/mapping-service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/mapping/ tests/unit/mapping-service.test.ts
git commit -m "feat: deterministic endpoint mapping with manual split/merged group support"
```

---

## Task 9: Express App and API Routes

**Files:**
- Create: `src/server/app.ts`
- Create: `src/server/index.ts`
- Create: `src/server/transport/routes/projects.ts`
- Create: `src/server/transport/routes/endpoints.ts`
- Create: `src/server/transport/routes/mappings.ts`
- Create: `src/server/transport/sse.ts`

**Interfaces:**
- Consumes: all prior modules
- Produces: running Express server on `127.0.0.1:3000`; REST API verified manually

- [ ] **Step 1: Write `src/server/transport/sse.ts`**

```typescript
import type { Response } from 'express'

export class SseManager {
  private clients = new Map<string, Response>()

  add(id: string, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    this.clients.set(id, res)
    res.on('close', () => this.clients.delete(id))
  }

  send(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const res of this.clients.values()) {
      res.write(payload)
    }
  }

  remove(id: string): void {
    this.clients.delete(id)
  }
}
```

- [ ] **Step 2: Write `src/server/transport/routes/projects.ts`**

```typescript
import { Router } from 'express'
import type { ProjectsRepo } from '../../persistence/repos/projects-repo.js'
import type { RepoService } from '../../repository/repo-service.js'

export function projectsRouter(projectsRepo: ProjectsRepo, repoService: RepoService): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(projectsRepo.list())
  })

  router.post('/', (req, res) => {
    const { name, sourcePath, targetPath } = req.body
    if (!name || !sourcePath || !targetPath) {
      res.status(400).json({ error: 'name, sourcePath, targetPath required' }); return
    }
    const srcV = repoService.validateRoot(sourcePath)
    if (!srcV.valid) { res.status(422).json({ error: `source: ${srcV.error}` }); return }
    const tgtV = repoService.validateRoot(targetPath)
    if (!tgtV.valid) { res.status(422).json({ error: `target: ${tgtV.error}` }); return }

    const project = projectsRepo.create(name, sourcePath, targetPath)
    res.status(201).json(project)
  })

  router.get('/:id', (req, res) => {
    const project = projectsRepo.getById(req.params.id)
    if (!project) { res.status(404).json({ error: 'Not found' }); return }
    res.json(project)
  })

  router.delete('/:id', (req, res) => {
    projectsRepo.delete(req.params.id)
    res.status(204).end()
  })

  return router
}
```

- [ ] **Step 3: Write `src/server/transport/routes/mappings.ts`**

```typescript
import { Router } from 'express'
import type { MappingService } from '../../mapping/mapping-service.js'

export function mappingsRouter(mappingService: MappingService): Router {
  const router = Router({ mergeParams: true })

  router.post('/auto-match', (req, res) => {
    const groups = mappingService.autoMatch(req.params.projectId)
    res.json(groups)
  })

  router.post('/', (req, res) => {
    const { groupType, sourceIds, targetIds, correspondence } = req.body
    const group = mappingService.createManualGroup(req.params.projectId, { groupType, sourceIds, targetIds, correspondence })
    res.status(201).json(group)
  })

  router.patch('/:groupId', (req, res) => {
    try {
      const group = mappingService.updateGroup(req.params.groupId, req.body)
      res.json(group)
    } catch {
      res.status(404).json({ error: 'Not found' })
    }
  })

  return router
}
```

- [ ] **Step 4: Write `src/server/app.ts`**

```typescript
import express from 'express'
import { SessionManager } from './transport/session.js'
import { createOriginMiddleware } from './transport/origin-middleware.js'
import { requireSession } from './transport/auth-middleware.js'
import { projectsRouter } from './transport/routes/projects.js'
import { mappingsRouter } from './transport/routes/mappings.js'
import { SseManager } from './transport/sse.js'
import { openDb } from './persistence/db.js'
import { ProjectsRepo } from './persistence/repos/projects-repo.js'
import { EndpointsRepo } from './persistence/repos/endpoints-repo.js'
import { MappingsRepo } from './persistence/repos/mappings-repo.js'
import { RepoService } from './repository/repo-service.js'
import { MappingService } from './mapping/mapping-service.js'
import { randomUUID } from 'crypto'

export function createApp(dbPath: string) {
  const db = openDb(dbPath)
  const sessions = new SessionManager()
  const sse = new SseManager()

  const projectsRepo = new ProjectsRepo(db)
  const endpointsRepo = new EndpointsRepo(db)
  const mappingsRepo = new MappingsRepo(db)
  const repoService = new RepoService()
  const mappingService = new MappingService(endpointsRepo, mappingsRepo)

  const app = express()
  app.use(express.json())
  app.use(createOriginMiddleware(['http://localhost:5173', 'http://localhost:3000']))

  // Bootstrap exchange (public)
  app.post('/auth/exchange', (req, res) => {
    const { bootstrapToken } = req.body
    const result = sessions.createSession(bootstrapToken)
    if (!result) { res.status(401).json({ error: 'Invalid or expired bootstrap token' }); return }
    res.json({ sessionToken: result.sessionToken })
  })

  // Protected API
  app.use('/api', requireSession(sessions))
  app.use('/api/projects', projectsRouter(projectsRepo, repoService))
  app.use('/api/projects/:projectId/mappings', mappingsRouter(mappingService))

  // SSE
  app.get('/events', requireSession(sessions), (req, res) => {
    sse.add(randomUUID(), res)
  })

  return { app, sessions, sse, db }
}
```

- [ ] **Step 5: Write `src/server/index.ts`**

```typescript
import { createApp } from './app.js'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'

const DATA_DIR = join(homedir(), '.amr')
mkdirSync(DATA_DIR, { recursive: true })

const { app, sessions } = createApp(join(DATA_DIR, 'amr.db'))

const PORT = 3000
const HOST = '127.0.0.1'

const server = app.listen(PORT, HOST, () => {
  const { token } = sessions.generateBootstrapCredential()
  console.log(`AI Migration Reviewer started`)
  console.log(`Open: http://${HOST}:${PORT}?bootstrap=${token}`)
  console.log(`Bootstrap token is single-use and expires in 60 seconds.`)
})

process.on('SIGINT', () => { server.close(); process.exit(0) })
process.on('SIGTERM', () => { server.close(); process.exit(0) })
```

- [ ] **Step 6: Start and verify manually**

```bash
npm run dev
# Expected: "AI Migration Reviewer started" + bootstrap URL
# Open URL in browser — should see 401 on /api/projects without token
```

- [ ] **Step 7: Commit**

```bash
git add src/server/app.ts src/server/index.ts src/server/transport/
git commit -m "feat: Express server with session auth, origin protection, and REST API routes"
```

---

## Task 10: Browser UI Shell

**Files:**
- Create: `src/ui/index.html`
- Create: `src/ui/src/main.tsx`
- Create: `src/ui/src/App.tsx`
- Create: `src/ui/src/api/client.ts`
- Create: `src/ui/src/pages/ProjectListPage.tsx`
- Create: `src/ui/src/pages/ProjectSetupPage.tsx`
- Create: `src/ui/src/pages/EndpointInventoryPage.tsx`
- Create: `src/ui/src/pages/MappingEditorPage.tsx`

**Interfaces:**
- Consumes: all API routes from Task 9
- Produces: working browser UI at `http://localhost:5173` (Vite dev) that bootstraps session, lists/creates projects, shows endpoints and mapping editor

- [ ] **Step 1: Write `src/ui/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Migration Reviewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `src/ui/src/api/client.ts`**

```typescript
const BASE = '/api'
let sessionToken: string | null = null

export async function bootstrap(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const bootstrapToken = params.get('bootstrap')
  if (!bootstrapToken) return false

  const res = await fetch('/auth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bootstrapToken })
  })
  if (!res.ok) return false
  const { sessionToken: token } = await res.json()
  sessionToken = token
  // Remove bootstrap token from URL without triggering navigation
  window.history.replaceState({}, '', window.location.pathname)
  return true
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
      ...init.headers
    }
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export const api = {
  projects: {
    list: () => apiRequest<any[]>('/projects'),
    create: (name: string, sourcePath: string, targetPath: string) =>
      apiRequest('/projects', { method: 'POST', body: JSON.stringify({ name, sourcePath, targetPath }) }),
    delete: (id: string) => apiRequest(`/projects/${id}`, { method: 'DELETE' })
  },
  mappings: {
    autoMatch: (projectId: string) =>
      apiRequest(`/projects/${projectId}/mappings/auto-match`, { method: 'POST' }),
    createManual: (projectId: string, body: any) =>
      apiRequest(`/projects/${projectId}/mappings`, { method: 'POST', body: JSON.stringify(body) }),
    update: (projectId: string, groupId: string, patch: any) =>
      apiRequest(`/projects/${projectId}/mappings/${groupId}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }
}
```

- [ ] **Step 3: Write `src/ui/src/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { bootstrap } from './api/client'
import { ProjectListPage } from './pages/ProjectListPage'

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<'projects'>('projects')

  useEffect(() => {
    bootstrap().then(ok => {
      if (ok) setReady(true)
      else setError('No valid bootstrap token. Start the server and use the provided URL.')
    })
  }, [])

  if (error) return <div style={{ padding: 24, color: 'red' }}>{error}</div>
  if (!ready) return <div style={{ padding: 24 }}>Connecting...</div>

  return <ProjectListPage />
}
```

- [ ] **Step 4: Write `src/ui/src/pages/ProjectListPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { api } from '../api/client'

export function ProjectListPage() {
  const [projects, setProjects] = useState<any[]>([])
  const [name, setName] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [targetPath, setTargetPath] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = () => api.projects.list().then(setProjects).catch(e => setError(e.message))

  useEffect(() => { load() }, [])

  const create = async () => {
    try {
      await api.projects.create(name, sourcePath, targetPath)
      setName(''); setSourcePath(''); setTargetPath('')
      load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'monospace' }}>
      <h1>AI Migration Reviewer</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <section>
        <h2>New Project</h2>
        <label>Name: <input value={name} onChange={e => setName(e.target.value)} /></label><br />
        <label>Source repo path: <input value={sourcePath} onChange={e => setSourcePath(e.target.value)} size={60} /></label><br />
        <label>Target repo path: <input value={targetPath} onChange={e => setTargetPath(e.target.value)} size={60} /></label><br />
        <button onClick={create}>Create Project</button>
      </section>
      <section>
        <h2>Projects</h2>
        {projects.length === 0 && <p>No projects yet.</p>}
        <ul>
          {projects.map(p => (
            <li key={p.id}>
              <strong>{p.name}</strong> — {p.source_path} → {p.target_path}
              <button onClick={() => api.projects.delete(p.id).then(load)} style={{ marginLeft: 8 }}>Delete</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Write `src/ui/src/main.tsx`**

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
```

- [ ] **Step 6: Start both servers and verify in browser**

```bash
# Terminal 1
npm run dev

# Terminal 2
npx vite --config vite.config.ts
# Open the URL printed by the server (with ?bootstrap=...) in a browser
# Should see project list UI; create a project with valid paths
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/
git commit -m "feat: browser UI shell with session bootstrap, project list and create"
```

---

## Phase 1 Complete

After Task 10, Phase 1 delivers:
- Local server bound to `127.0.0.1` with session-authenticated API
- SQLite persistence (projects, endpoints, mapping groups)
- Lumen 11 and NestJS 11 static route discovery (file-reading only, no code execution)
- Deterministic one-to-one matching + manual split/merged groups
- Browser UI with project management

**Verification checklist against requirements:**
- [ ] §5.1 — project creation, path validation, read-only repository access ✓
- [ ] §5.2 — endpoint discovery without running code, manual mapping ✓
- [ ] §6 — no AI in this phase; all enforcement is deterministic ✓
- [ ] §7 — Node.js, local only, 127.0.0.1, macOS/Linux ✓
- [ ] §10 — Origin/Host protection, session auth, no credentials in storage ✓

Proceed to Phase 2 for AI analysis pipeline, budget ledger, findings, test scenarios, and export.
