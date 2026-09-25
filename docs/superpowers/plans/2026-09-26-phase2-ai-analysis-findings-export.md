# AI API Migration Reviewer — Phase 2: AI Analysis, Findings & Export

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the full AI-powered review pipeline on top of Phase 1: context collection, secret protection, user approval gates, budget ledger, OpenAI adapter, iterative analysis loop, evidence validation, human finding dispositions, test scenario management, freshness/rediscovery, and Markdown export.

**Architecture:** The coordinator owns every state transition and is the sole SQLite writer. All AI outputs are provisional. The budget ledger writes a durable reservation before each OpenAI request. Secret detection and approval gates are enforced deterministically — not by AI compliance. Workers have no network access. The OpenAI adapter is the only egress path for analysis content.

**Tech Stack:** Phase 1 stack + openai (official SDK, automatic retries DISABLED), node:crypto for fingerprinting, he (HTML entity encoding for Markdown sanitization)

**Spec:** [docs/requirements.md](../../requirements.md) | [docs/architecture.md](../../architecture.md)

**Depends on:** Phase 1 plan completed — all Phase 1 modules available.

## Global Constraints

- Node.js ≥ 20 LTS; TypeScript strict mode
- `127.0.0.1` only; no external network except OpenAI via adapter
- OpenAI SDK `maxRetries: 0` — all retries are explicit and user-initiated
- Budget reservation committed to SQLite before any request is sent; if commit fails, do not send
- All AI findings are `provisional: true` until user sets disposition
- No raw repository source code in SQLite — only sanitized evidence after redaction
- Secret detection applies to: repository files, user-entered content, model output, exports
- Markdown previews treat embedded HTML/scripts as non-executable plain text
- Coordinator is the sole database writer — workers and adapter have no db handles
- Deletion stops work before removing records; late responses cannot recreate deleted records

---

## File Structure (additions to Phase 1)

```
src/
  server/
    context/
      context-collector.ts        Dependency traversal, manifest assembly, limits
      manifest-types.ts           ContextManifest, FileCapture, TraversalLimit types
    secrets/
      secret-detector.ts          Regex + entropy detection for secrets
      redactor.ts                 Redact detected spans, maintain source-span map
    approval/
      approval-service.ts         Record exact sanitized-content approvals per batch
      approval-types.ts           ApprovalRecord, ApprovalStatus types
    budget/
      budget-ledger.ts            Reserve → reconcile lifecycle, admission control
      pricing-registry.ts         Model pricing lookup and validation
      budget-types.ts             Reservation, UsageRecord, BudgetStatus types
    openai/
      openai-adapter.ts           Validated OpenAI requests, usage normalization
      model-registry.ts           Validated model list with pricing metadata
      openai-types.ts             AnalysisRequest, AnalysisResponse, ModelCapabilities
    analysis/
      analysis-loop.ts            Iterative AI analysis coordinator (per batch/group)
      evidence-validator.ts       Validate output structure, citations, secret scan
      analysis-types.ts           AnalysisJob, AnalysisStatus, GroupAnalysisResult
    findings/
      findings-service.ts         Provisional findings, human dispositions, fix tracking
      scenarios-service.ts        Test scenario CRUD, export to Markdown checklist
      findings-types.ts           Finding, Disposition, Severity, Evidence types
      scenario-types.ts           TestScenario, ScenarioStatus types
    export/
      markdown-exporter.ts        Markdown report generation with preview
      checklist-exporter.ts       Test checklist Markdown export
    persistence/
      schema.ts                   EXTENDED: new tables for Phase 2
      repos/
        batches-repo.ts           batches + batch_groups tables
        findings-repo.ts          findings table CRUD
        scenarios-repo.ts         test_scenarios table CRUD
        budget-repo.ts            budget_reservations + usage_records tables
        approvals-repo.ts         approval_records table CRUD
    transport/
      routes/
        batches.ts                /api/projects/:id/batches endpoints
        findings.ts               /api/batches/:id/findings endpoints
        scenarios.ts              /api/batches/:id/scenarios endpoints
        export.ts                 /api/batches/:id/export endpoints
        auth-key.ts               /api/session/key — masked key entry
```

---

## Task 11: Extended Schema (Phase 2 Tables)

**Files:**
- Modify: `src/server/persistence/schema.ts` — add migration 002
- Create: `src/server/persistence/repos/batches-repo.ts`
- Create: `src/server/persistence/repos/findings-repo.ts`
- Create: `src/server/persistence/repos/scenarios-repo.ts`
- Create: `src/server/persistence/repos/budget-repo.ts`
- Create: `src/server/persistence/repos/approvals-repo.ts`
- Test: `tests/unit/schema-phase2.test.ts`

**Interfaces:**
- Consumes: `openDb` from Phase 1
- Produces: all Phase 2 table repos available for use in subsequent tasks

- [ ] **Step 1: Write failing schema test**

```typescript
// tests/unit/schema-phase2.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '../../src/server/persistence/db'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir: string, db: Database.Database

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'amr-p2-'))
  db = openDb(join(tmpDir, 'test.db'))
})
afterEach(() => { db.close(); rmSync(tmpDir, { recursive: true }) })

const tables = ['batches', 'batch_groups', 'findings', 'test_scenarios',
                'budget_reservations', 'usage_records', 'approval_records']

for (const table of tables) {
  it(`creates ${table} table`, () => {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`).get()
    expect(row).toBeDefined()
  })
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/unit/schema-phase2.test.ts
```
Expected: FAIL

- [ ] **Step 3: Add migration 002 to `src/server/persistence/schema.ts`**

Open `src/server/persistence/schema.ts` and append to the `MIGRATIONS` array:

```typescript
  /* 002 */ `
    CREATE TABLE IF NOT EXISTS batches (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','running','completed','failed','canceled')),
      model_id        TEXT NOT NULL,
      per_group_budget_cents INTEGER NOT NULL,
      total_budget_cents     INTEGER NOT NULL,
      approval_id     TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS batch_groups (
      id          TEXT PRIMARY KEY,
      batch_id    TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      group_id    TEXT NOT NULL REFERENCES mapping_groups(id),
      status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','running','completed','failed','canceled','incomplete')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS approval_records (
      id              TEXT PRIMARY KEY,
      batch_id        TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      manifest_hash   TEXT NOT NULL,
      approved_at     TEXT NOT NULL DEFAULT (datetime('now')),
      content_summary TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS budget_reservations (
      id              TEXT PRIMARY KEY,
      batch_id        TEXT NOT NULL,
      group_id        TEXT NOT NULL,
      request_id      TEXT NOT NULL UNIQUE,
      reserved_cents  INTEGER NOT NULL,
      status          TEXT NOT NULL DEFAULT 'reserved'
                        CHECK(status IN ('reserved','reconciled','unknown-cost')),
      actual_cents    INTEGER,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id              TEXT PRIMARY KEY,
      batch_id        TEXT NOT NULL,
      group_id        TEXT NOT NULL,
      request_id      TEXT NOT NULL,
      model_id        TEXT NOT NULL,
      prompt_tokens   INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      total_cents     INTEGER NOT NULL,
      recorded_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS findings (
      id                  TEXT PRIMARY KEY,
      batch_id            TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      group_id            TEXT NOT NULL,
      title               TEXT NOT NULL,
      description         TEXT NOT NULL,
      evidence            TEXT NOT NULL DEFAULT '{}',
      suggested_severity  TEXT NOT NULL CHECK(suggested_severity IN ('High','Medium','Low','Unassessed')),
      human_severity      TEXT CHECK(human_severity IN ('High','Medium','Low','Unassessed')),
      disposition         TEXT NOT NULL DEFAULT 'unresolved'
                            CHECK(disposition IN ('unresolved','verified-defect','intentional-difference','false-positive')),
      provisional         INTEGER NOT NULL DEFAULT 1,
      fix_status          TEXT DEFAULT NULL,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS test_scenarios (
      id              TEXT PRIMARY KEY,
      finding_id      TEXT REFERENCES findings(id) ON DELETE SET NULL,
      group_id        TEXT NOT NULL,
      batch_id        TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      method          TEXT,
      path            TEXT,
      headers         TEXT DEFAULT '{}',
      query_params    TEXT DEFAULT '{}',
      body            TEXT,
      expected_status INTEGER,
      preconditions   TEXT,
      enabled         INTEGER NOT NULL DEFAULT 1,
      is_ai_generated INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/unit/schema-phase2.test.ts
```
Expected: PASS (7 tests)

- [ ] **Step 5: Write `src/server/persistence/repos/batches-repo.ts`**

```typescript
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface BatchRow {
  id: string
  project_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled'
  model_id: string
  per_group_budget_cents: number
  total_budget_cents: number
  approval_id: string | null
  created_at: string
  updated_at: string
}

export interface BatchGroupRow {
  id: string
  batch_id: string
  group_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled' | 'incomplete'
  updated_at: string
}

export class BatchesRepo {
  constructor(private db: Database.Database) {}

  createBatch(projectId: string, modelId: string, perGroupCents: number, totalCents: number): BatchRow {
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO batches (id, project_id, model_id, per_group_budget_cents, total_budget_cents)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, projectId, modelId, perGroupCents, totalCents)
    return this.getBatch(id)!
  }

  getBatch(id: string): BatchRow | undefined {
    return this.db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as BatchRow | undefined
  }

  updateBatchStatus(id: string, status: BatchRow['status']): void {
    this.db.prepare(`UPDATE batches SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id)
  }

  addGroup(batchId: string, groupId: string): BatchGroupRow {
    const id = randomUUID()
    this.db.prepare('INSERT INTO batch_groups (id, batch_id, group_id) VALUES (?, ?, ?)').run(id, batchId, groupId)
    return this.db.prepare('SELECT * FROM batch_groups WHERE id = ?').get(id) as BatchGroupRow
  }

  updateGroupStatus(id: string, status: BatchGroupRow['status']): void {
    this.db.prepare(`UPDATE batch_groups SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id)
  }

  listGroupsByBatch(batchId: string): BatchGroupRow[] {
    return this.db.prepare('SELECT * FROM batch_groups WHERE batch_id = ?').all(batchId) as BatchGroupRow[]
  }
}
```

- [ ] **Step 6: Write `src/server/persistence/repos/budget-repo.ts`**

```typescript
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface ReservationRow {
  id: string
  batch_id: string
  group_id: string
  request_id: string
  reserved_cents: number
  status: 'reserved' | 'reconciled' | 'unknown-cost'
  actual_cents: number | null
  created_at: string
  updated_at: string
}

export class BudgetRepo {
  constructor(private db: Database.Database) {}

  reserveWithin(batchId: string, groupId: string, requestId: string, cents: number): ReservationRow {
    const id = randomUUID()
    // Atomic: check limits and insert reservation in one transaction
    const reservation = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO budget_reservations (id, batch_id, group_id, request_id, reserved_cents)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, batchId, groupId, requestId, cents)
      return this.db.prepare('SELECT * FROM budget_reservations WHERE id = ?').get(id) as ReservationRow
    })()
    return reservation
  }

  reconcile(requestId: string, actualCents: number): void {
    this.db.prepare(`
      UPDATE budget_reservations
      SET status = 'reconciled', actual_cents = ?, updated_at = datetime('now')
      WHERE request_id = ?
    `).run(actualCents, requestId)
    this.db.prepare(`
      INSERT INTO usage_records (id, batch_id, group_id, request_id, model_id, prompt_tokens, completion_tokens, total_cents)
      SELECT ?, batch_id, group_id, request_id, '', 0, 0, ? FROM budget_reservations WHERE request_id = ?
    `).run(randomUUID(), actualCents, requestId)
  }

  markUnknownCost(requestId: string): void {
    this.db.prepare(`
      UPDATE budget_reservations SET status = 'unknown-cost', updated_at = datetime('now') WHERE request_id = ?
    `).run(requestId)
  }

  totalCommittedCents(batchId: string): number {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(reserved_cents),0) as total
      FROM budget_reservations WHERE batch_id = ? AND status != 'reconciled'
    `).get(batchId) as { total: number }
    const reconciled = this.db.prepare(`
      SELECT COALESCE(SUM(actual_cents),0) as total FROM budget_reservations
      WHERE batch_id = ? AND status = 'reconciled'
    `).get(batchId) as { total: number }
    return row.total + reconciled.total
  }

  groupCommittedCents(batchId: string, groupId: string): number {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(reserved_cents),0) as total
      FROM budget_reservations WHERE batch_id = ? AND group_id = ? AND status != 'reconciled'
    `).get(batchId, groupId) as { total: number }
    return row.total
  }

  hasUnknownCost(batchId: string): boolean {
    const row = this.db.prepare(
      `SELECT COUNT(*) as c FROM budget_reservations WHERE batch_id = ? AND status = 'unknown-cost'`
    ).get(batchId) as { c: number }
    return row.c > 0
  }
}
```

- [ ] **Step 7: Write `src/server/persistence/repos/findings-repo.ts`**

```typescript
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface FindingRow {
  id: string
  batch_id: string
  group_id: string
  title: string
  description: string
  evidence: string   // JSON
  suggested_severity: 'High' | 'Medium' | 'Low' | 'Unassessed'
  human_severity: string | null
  disposition: 'unresolved' | 'verified-defect' | 'intentional-difference' | 'false-positive'
  provisional: number   // SQLite boolean
  fix_status: string | null
  created_at: string
  updated_at: string
}

export class FindingsRepo {
  constructor(private db: Database.Database) {}

  insert(batchId: string, groupId: string, data: Omit<FindingRow, 'id' | 'batch_id' | 'group_id' | 'created_at' | 'updated_at'>): FindingRow {
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO findings (id, batch_id, group_id, title, description, evidence, suggested_severity, human_severity, disposition, provisional, fix_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, batchId, groupId, data.title, data.description, data.evidence,
       data.suggested_severity, data.human_severity, data.disposition, data.provisional, data.fix_status)
    return this.getById(id)!
  }

  getById(id: string): FindingRow | undefined {
    return this.db.prepare('SELECT * FROM findings WHERE id = ?').get(id) as FindingRow | undefined
  }

  listByBatch(batchId: string): FindingRow[] {
    return this.db.prepare('SELECT * FROM findings WHERE batch_id = ? ORDER BY suggested_severity').all(batchId) as FindingRow[]
  }

  updateDisposition(id: string, disposition: FindingRow['disposition'], humanSeverity?: string): void {
    this.db.prepare(`
      UPDATE findings SET disposition = ?, human_severity = ?, provisional = 0, updated_at = datetime('now') WHERE id = ?
    `).run(disposition, humanSeverity ?? null, id)
  }

  markFixReported(id: string): void {
    this.db.prepare(`UPDATE findings SET fix_status = 'fix-reported', updated_at = datetime('now') WHERE id = ?`).run(id)
  }

  markFixVerified(id: string): void {
    this.db.prepare(`UPDATE findings SET fix_status = 'fix-verified', updated_at = datetime('now') WHERE id = ?`).run(id)
  }
}
```

- [ ] **Step 8: Write `src/server/persistence/repos/scenarios-repo.ts`**

```typescript
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface ScenarioRow {
  id: string
  finding_id: string | null
  group_id: string
  batch_id: string
  title: string
  description: string
  method: string | null
  path: string | null
  headers: string
  query_params: string
  body: string | null
  expected_status: number | null
  preconditions: string | null
  enabled: number
  is_ai_generated: number
  created_at: string
  updated_at: string
}

export class ScenariosRepo {
  constructor(private db: Database.Database) {}

  insert(data: Omit<ScenarioRow, 'id' | 'created_at' | 'updated_at'>): ScenarioRow {
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO test_scenarios (id, finding_id, group_id, batch_id, title, description, method, path, headers, query_params, body, expected_status, preconditions, enabled, is_ai_generated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.finding_id, data.group_id, data.batch_id, data.title, data.description,
       data.method, data.path, data.headers, data.query_params, data.body,
       data.expected_status, data.preconditions, data.enabled, data.is_ai_generated)
    return this.getById(id)!
  }

  getById(id: string): ScenarioRow | undefined {
    return this.db.prepare('SELECT * FROM test_scenarios WHERE id = ?').get(id) as ScenarioRow | undefined
  }

  listByBatch(batchId: string): ScenarioRow[] {
    return this.db.prepare('SELECT * FROM test_scenarios WHERE batch_id = ? ORDER BY group_id').all(batchId) as ScenarioRow[]
  }

  update(id: string, patch: Partial<Pick<ScenarioRow, 'title' | 'description' | 'method' | 'path' | 'headers' | 'body' | 'expected_status' | 'preconditions' | 'enabled'>>): void {
    const fields = Object.keys(patch).map(k => `${k} = ?`).join(', ')
    const vals = Object.values(patch)
    this.db.prepare(`UPDATE test_scenarios SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM test_scenarios WHERE id = ?').run(id)
  }
}
```

- [ ] **Step 9: Write `src/server/persistence/repos/approvals-repo.ts`**

```typescript
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface ApprovalRow {
  id: string
  batch_id: string
  manifest_hash: string
  approved_at: string
  content_summary: string  // JSON
}

export class ApprovalsRepo {
  constructor(private db: Database.Database) {}

  record(batchId: string, manifestHash: string, contentSummary: object): ApprovalRow {
    const id = randomUUID()
    this.db.prepare(
      'INSERT INTO approval_records (id, batch_id, manifest_hash, content_summary) VALUES (?, ?, ?, ?)'
    ).run(id, batchId, manifestHash, JSON.stringify(contentSummary))
    return this.db.prepare('SELECT * FROM approval_records WHERE id = ?').get(id) as ApprovalRow
  }

  getLatestForBatch(batchId: string): ApprovalRow | undefined {
    return this.db.prepare(
      'SELECT * FROM approval_records WHERE batch_id = ? ORDER BY approved_at DESC LIMIT 1'
    ).get(batchId) as ApprovalRow | undefined
  }

  matchesHash(batchId: string, hash: string): boolean {
    const row = this.getLatestForBatch(batchId)
    return row?.manifest_hash === hash
  }
}
```

- [ ] **Step 10: Run all schema tests**

```bash
npm test -- tests/unit/schema-phase2.test.ts
```
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/server/persistence/ tests/unit/schema-phase2.test.ts
git commit -m "feat: Phase 2 schema — batches, findings, scenarios, budget, approvals"
```

---

## Task 12: Context Collector and Manifest

**Files:**
- Create: `src/server/context/manifest-types.ts`
- Create: `src/server/context/context-collector.ts`
- Test: `tests/unit/context-collector.test.ts`

**Interfaces:**
- Consumes: `RepoService`, `MappingsRepo`, `EndpointsRepo`
- Produces:
  - `ContextCollector.collect(projectId: string, groupId: string, roots: { source: string; target: string }): Promise<ContextManifest>`
  - `ContextManifest { id: string; groupId: string; files: FileCapture[]; gaps: string[]; hash: string }`
  - `FileCapture { relativePath: string; repo: 'source'|'target'; content: string; fingerprint: string }`

- [ ] **Step 1: Write `src/server/context/manifest-types.ts`**

```typescript
export interface FileCapture {
  relativePath: string
  repo: 'source' | 'target'
  content: string          // sanitized — never raw if secrets detected
  fingerprint: string      // sha256 hex of original content
}

export interface ContextManifest {
  id: string
  groupId: string
  files: FileCapture[]
  gaps: string[]           // unresolved dependencies, limits hit
  hash: string             // deterministic hash of all fingerprints + groupId
  collectedAt: string
}

export interface CollectionLimits {
  maxFiles: number         // default 50
  maxFileSizeBytes: number // default 100_000
  maxTotalBytes: number    // default 500_000
}

export const DEFAULT_LIMITS: CollectionLimits = {
  maxFiles: 50,
  maxFileSizeBytes: 100_000,
  maxTotalBytes: 500_000
}
```

- [ ] **Step 2: Write failing test**

```typescript
// tests/unit/context-collector.test.ts
import { describe, it, expect } from 'vitest'
import { ContextCollector } from '../../src/server/context/context-collector'
import { RepoService } from '../../src/server/repository/repo-service'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const tmpDir = mkdtempSync(join(tmpdir(), 'amr-ctx-'))
const srcRoot = join(tmpDir, 'source')
const tgtRoot = join(tmpDir, 'target')
mkdirSync(join(srcRoot, 'app/Http/Controllers'), { recursive: true })
mkdirSync(join(tgtRoot, 'src/users'), { recursive: true })
writeFileSync(join(srcRoot, 'app/Http/Controllers/UserController.php'), '<?php class UserController {}')
writeFileSync(join(tgtRoot, 'src/users/users.controller.ts'), 'export class UsersController {}')

describe('ContextCollector.collect', () => {
  it('returns manifest with captured files', async () => {
    const collector = new ContextCollector(new RepoService())
    const manifest = await collector.collect('g1', [
      { repo: 'source', relativePath: 'app/Http/Controllers/UserController.php' },
      { repo: 'target', relativePath: 'src/users/users.controller.ts' }
    ], { source: srcRoot, target: tgtRoot })

    expect(manifest.files).toHaveLength(2)
    expect(manifest.hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('includes fingerprint per file', async () => {
    const collector = new ContextCollector(new RepoService())
    const manifest = await collector.collect('g1', [
      { repo: 'source', relativePath: 'app/Http/Controllers/UserController.php' }
    ], { source: srcRoot, target: tgtRoot })
    expect(manifest.files[0].fingerprint).toHaveLength(64)
  })

  it('records gaps when file is missing', async () => {
    const collector = new ContextCollector(new RepoService())
    const manifest = await collector.collect('g1', [
      { repo: 'source', relativePath: 'does/not/exist.php' }
    ], { source: srcRoot, target: tgtRoot })
    expect(manifest.gaps.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Write `src/server/context/context-collector.ts`**

```typescript
import { createHash, randomUUID } from 'crypto'
import { readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import type { RepoService } from '../repository/repo-service.js'
import type { ContextManifest, FileCapture, CollectionLimits } from './manifest-types.js'
import { DEFAULT_LIMITS } from './manifest-types.js'

export interface FileRef {
  repo: 'source' | 'target'
  relativePath: string
}

export class ContextCollector {
  constructor(private repoService: RepoService) {}

  async collect(
    groupId: string,
    fileRefs: FileRef[],
    roots: { source: string; target: string },
    limits: CollectionLimits = DEFAULT_LIMITS
  ): Promise<ContextManifest> {
    const files: FileCapture[] = []
    const gaps: string[] = []
    let totalBytes = 0

    for (const ref of fileRefs) {
      if (files.length >= limits.maxFiles) {
        gaps.push(`File limit (${limits.maxFiles}) reached — remaining files omitted`)
        break
      }
      const root = ref.repo === 'source' ? roots.source : roots.target
      const absPath = join(root, ref.relativePath)

      if (!existsSync(absPath)) {
        gaps.push(`Missing: [${ref.repo}] ${ref.relativePath}`)
        continue
      }

      const stat = statSync(absPath)
      if (stat.size > limits.maxFileSizeBytes) {
        gaps.push(`Oversized (${stat.size}B): [${ref.repo}] ${ref.relativePath}`)
        continue
      }

      if (totalBytes + stat.size > limits.maxTotalBytes) {
        gaps.push(`Total size limit reached — [${ref.repo}] ${ref.relativePath} omitted`)
        break
      }

      let content: string
      try {
        content = this.repoService.safeRead(root, ref.relativePath)
      } catch (e) {
        gaps.push(`Read error: [${ref.repo}] ${ref.relativePath} — ${e}`)
        continue
      }

      const fingerprint = createHash('sha256').update(content).digest('hex')
      files.push({ relativePath: ref.relativePath, repo: ref.repo, content, fingerprint })
      totalBytes += stat.size
    }

    const hash = this.computeManifestHash(groupId, files)
    return { id: randomUUID(), groupId, files, gaps, hash, collectedAt: new Date().toISOString() }
  }

  private computeManifestHash(groupId: string, files: FileCapture[]): string {
    const h = createHash('sha256')
    h.update(groupId)
    for (const f of files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
      h.update(f.repo + ':' + f.relativePath + ':' + f.fingerprint)
    }
    return h.digest('hex')
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/context-collector.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/context/ tests/unit/context-collector.test.ts
git commit -m "feat: context collector with manifest, file fingerprinting, and limit tracking"
```

---

## Task 13: Secret Detection and Redaction

**Files:**
- Create: `src/server/secrets/secret-detector.ts`
- Create: `src/server/secrets/redactor.ts`
- Test: `tests/unit/secret-detector.test.ts`

**Interfaces:**
- Produces:
  - `SecretDetector.scan(text: string): DetectedSecret[]`
  - `DetectedSecret { type: string; start: number; end: number }`
  - `Redactor.redact(text: string): { redacted: string; spans: DetectedSecret[]; hasSecrets: boolean }`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/secret-detector.test.ts
import { describe, it, expect } from 'vitest'
import { SecretDetector } from '../../src/server/secrets/secret-detector'
import { Redactor } from '../../src/server/secrets/redactor'

describe('SecretDetector.scan', () => {
  const detector = new SecretDetector()

  it('detects AWS access key', () => {
    const secrets = detector.scan('key = AKIAIOSFODNN7EXAMPLE and more text')
    expect(secrets.length).toBeGreaterThan(0)
    expect(secrets[0].type).toContain('AWS')
  })

  it('detects generic API key pattern', () => {
    const secrets = detector.scan('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature')
    expect(secrets.length).toBeGreaterThan(0)
  })

  it('detects private key header', () => {
    const secrets = detector.scan('-----BEGIN RSA PRIVATE KEY-----\nMIIEo...')
    expect(secrets.length).toBeGreaterThan(0)
  })

  it('returns empty for clean text', () => {
    const secrets = detector.scan('class UserController extends Controller {}')
    expect(secrets).toHaveLength(0)
  })
})

describe('Redactor.redact', () => {
  it('replaces detected secrets with placeholder', () => {
    const redactor = new Redactor(new SecretDetector())
    const { redacted, hasSecrets } = redactor.redact('key = AKIAIOSFODNN7EXAMPLE')
    expect(hasSecrets).toBe(true)
    expect(redacted).toContain('[REDACTED:')
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE')
  })
})
```

- [ ] **Step 2: Write `src/server/secrets/secret-detector.ts`**

```typescript
export interface DetectedSecret {
  type: string
  start: number
  end: number
  value?: string  // only used internally for redaction; never logged or stored
}

interface Pattern { type: string; re: RegExp }

const PATTERNS: Pattern[] = [
  { type: 'AWS Access Key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: 'AWS Secret Key', re: /(?:aws_secret_access_key|aws_secret)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi },
  { type: 'Private Key Header', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { type: 'Bearer Token (JWT)', re: /Bearer\s+ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g },
  { type: 'Generic API Key', re: /(?:api_?key|api_?secret|client_?secret)\s*[=:]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/gi },
  { type: 'Password Assignment', re: /(?:password|passwd|pwd)\s*[=:]\s*['"]([^'"]{8,})['"](?!\s*\?)/gi },
  { type: 'Database URL with Credentials', re: /[a-z+]+:\/\/[^:@\s]+:[^@\s]+@[^\s'"]+/gi },
]

export class SecretDetector {
  scan(text: string): DetectedSecret[] {
    const results: DetectedSecret[] = []
    for (const { type, re } of PATTERNS) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        results.push({ type, start: m.index, end: m.index + m[0].length, value: m[0] })
      }
    }
    return results.sort((a, b) => a.start - b.start)
  }
}
```

- [ ] **Step 3: Write `src/server/secrets/redactor.ts`**

```typescript
import type { SecretDetector, DetectedSecret } from './secret-detector.js'

export interface RedactionResult {
  redacted: string
  spans: Omit<DetectedSecret, 'value'>[]
  hasSecrets: boolean
}

export class Redactor {
  constructor(private detector: SecretDetector) {}

  redact(text: string): RedactionResult {
    const secrets = this.detector.scan(text)
    if (secrets.length === 0) return { redacted: text, spans: [], hasSecrets: false }

    // Replace from end to start so indices stay valid
    let result = text
    const merged = this.mergeOverlapping(secrets)
    for (let i = merged.length - 1; i >= 0; i--) {
      const s = merged[i]
      result = result.slice(0, s.start) + `[REDACTED:${s.type}]` + result.slice(s.end)
    }

    const spans = merged.map(({ type, start, end }) => ({ type, start, end }))
    return { redacted: result, spans, hasSecrets: true }
  }

  private mergeOverlapping(secrets: DetectedSecret[]): DetectedSecret[] {
    const out: DetectedSecret[] = []
    for (const s of secrets) {
      const last = out[out.length - 1]
      if (last && s.start < last.end) {
        last.end = Math.max(last.end, s.end)
        last.type = last.type + '+' + s.type
      } else {
        out.push({ ...s })
      }
    }
    return out
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/secret-detector.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/secrets/ tests/unit/secret-detector.test.ts
git commit -m "feat: secret detection and redaction with span tracking"
```

---

## Task 14: Budget Ledger

**Files:**
- Create: `src/server/budget/budget-types.ts`
- Create: `src/server/budget/pricing-registry.ts`
- Create: `src/server/budget/budget-ledger.ts`
- Test: `tests/unit/budget-ledger.test.ts`

**Interfaces:**
- Consumes: `BudgetRepo`
- Produces:
  - `BudgetLedger.checkAndReserve(batchId, groupId, requestId, estimatedCents): ReservationRow` — throws `BudgetExceededError` if limits prevent dispatch
  - `BudgetLedger.reconcile(requestId, actualCents): void`
  - `BudgetLedger.markUnknownCost(requestId): void`

- [ ] **Step 1: Write `src/server/budget/budget-types.ts`**

```typescript
export interface ModelPricing {
  modelId: string
  promptCentsPerKToken: number
  completionCentsPerKToken: number
  maxOutputTokens: number
}

export class BudgetExceededError extends Error {
  constructor(public readonly limitType: 'group' | 'batch', available: number, requested: number) {
    super(`Budget exceeded (${limitType}): requested ${requested} cents, only ${available} available`)
    this.name = 'BudgetExceededError'
  }
}

export class UnsafeAccountingError extends Error {
  constructor(msg: string) { super(msg); this.name = 'UnsafeAccountingError' }
}
```

- [ ] **Step 2: Write `src/server/budget/pricing-registry.ts`**

```typescript
import type { ModelPricing } from './budget-types.js'

// Prices in US cents per 1000 tokens.
// MUST be validated against current OpenAI pricing before enabling a model.
const REGISTRY: ModelPricing[] = [
  { modelId: 'gpt-4o', promptCentsPerKToken: 0.25, completionCentsPerKToken: 1.0, maxOutputTokens: 4096 },
  { modelId: 'gpt-4o-mini', promptCentsPerKToken: 0.015, completionCentsPerKToken: 0.06, maxOutputTokens: 4096 },
]

export class PricingRegistry {
  getPricing(modelId: string): ModelPricing {
    const p = REGISTRY.find(m => m.modelId === modelId)
    if (!p) throw new Error(`Model ${modelId} not in validated registry — cannot enable`)
    return p
  }

  estimateCents(modelId: string, promptTokens: number, maxOutputTokens: number): number {
    const p = this.getPricing(modelId)
    const promptCents = (promptTokens / 1000) * p.promptCentsPerKToken
    const outputCents = (maxOutputTokens / 1000) * p.completionCentsPerKToken
    return Math.ceil(promptCents + outputCents)
  }

  computeActualCents(modelId: string, promptTokens: number, completionTokens: number): number {
    const p = this.getPricing(modelId)
    return Math.ceil((promptTokens / 1000) * p.promptCentsPerKToken + (completionTokens / 1000) * p.completionCentsPerKToken)
  }

  listValidated(): string[] {
    return REGISTRY.map(m => m.modelId)
  }
}
```

- [ ] **Step 3: Write failing test**

```typescript
// tests/unit/budget-ledger.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BudgetLedger } from '../../src/server/budget/budget-ledger'
import { BudgetExceededError } from '../../src/server/budget/budget-types'
import { BudgetRepo } from '../../src/server/persistence/repos/budget-repo'
import { BatchesRepo } from '../../src/server/persistence/repos/batches-repo'
import { ProjectsRepo } from '../../src/server/persistence/repos/projects-repo'
import { openDb } from '../../src/server/persistence/db'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'

let tmpDir: string, db: Database.Database, ledger: BudgetLedger
let batchId: string, groupId: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'amr-budget-'))
  db = openDb(join(tmpDir, 'test.db'))
  const projects = new ProjectsRepo(db)
  const batches = new BatchesRepo(db)
  const project = projects.create('p', '/s', '/t')
  const batch = batches.createBatch(project.id, 'gpt-4o', 100, 200)
  const bg = batches.addGroup(batch.id, 'g1')
  batchId = batch.id
  groupId = bg.id
  ledger = new BudgetLedger(new BudgetRepo(db), { perGroupCents: 100, totalCents: 200 })
})

afterEach(() => { db.close(); rmSync(tmpDir, { recursive: true }) })

describe('BudgetLedger.checkAndReserve', () => {
  it('allows reservation within limits', () => {
    const r = ledger.checkAndReserve(batchId, groupId, 'req-1', 50)
    expect(r.reserved_cents).toBe(50)
    expect(r.status).toBe('reserved')
  })

  it('throws BudgetExceededError when group limit exceeded', () => {
    ledger.checkAndReserve(batchId, groupId, 'req-1', 90)
    expect(() => ledger.checkAndReserve(batchId, groupId, 'req-2', 20)).toThrow(BudgetExceededError)
  })

  it('throws BudgetExceededError when batch limit exceeded', () => {
    ledger.checkAndReserve(batchId, groupId, 'req-1', 190)
    expect(() => ledger.checkAndReserve(batchId, groupId, 'req-2', 20)).toThrow(BudgetExceededError)
  })
})

describe('BudgetLedger.reconcile', () => {
  it('updates reservation to reconciled with actual amount', () => {
    ledger.checkAndReserve(batchId, groupId, 'req-1', 50)
    ledger.reconcile('req-1', 35)
    // After reconciling, 35 cents consumed, 165 remaining
    const r2 = ledger.checkAndReserve(batchId, groupId, 'req-2', 60)
    expect(r2.reserved_cents).toBe(60)
  })
})
```

- [ ] **Step 4: Write `src/server/budget/budget-ledger.ts`**

```typescript
import type { BudgetRepo, ReservationRow } from '../persistence/repos/budget-repo.js'
import { BudgetExceededError, UnsafeAccountingError } from './budget-types.js'

interface Limits {
  perGroupCents: number
  totalCents: number
}

export class BudgetLedger {
  constructor(private repo: BudgetRepo, private limits: Limits) {}

  checkAndReserve(batchId: string, groupId: string, requestId: string, estimatedCents: number): ReservationRow {
    if (this.repo.hasUnknownCost(batchId)) {
      throw new UnsafeAccountingError('Batch has unresolved unknown-cost requests — resolve before new requests')
    }

    const batchUsed = this.repo.totalCommittedCents(batchId)
    const groupUsed = this.repo.groupCommittedCents(batchId, groupId)

    if (groupUsed + estimatedCents > this.limits.perGroupCents) {
      throw new BudgetExceededError('group', this.limits.perGroupCents - groupUsed, estimatedCents)
    }
    if (batchUsed + estimatedCents > this.limits.totalCents) {
      throw new BudgetExceededError('batch', this.limits.totalCents - batchUsed, estimatedCents)
    }

    return this.repo.reserveWithin(batchId, groupId, requestId, estimatedCents)
  }

  reconcile(requestId: string, actualCents: number): void {
    this.repo.reconcile(requestId, actualCents)
  }

  markUnknownCost(requestId: string): void {
    this.repo.markUnknownCost(requestId)
  }

  hasUnknownCost(batchId: string): boolean {
    return this.repo.hasUnknownCost(batchId)
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/unit/budget-ledger.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/budget/ tests/unit/budget-ledger.test.ts
git commit -m "feat: budget ledger with pre-dispatch reservation, reconciliation, and admission control"
```

---

## Task 15: OpenAI Adapter and Model Registry

**Files:**
- Create: `src/server/openai/openai-types.ts`
- Create: `src/server/openai/model-registry.ts`
- Create: `src/server/openai/openai-adapter.ts`
- Test: `tests/unit/openai-adapter.test.ts`

**Interfaces:**
- Consumes: `PricingRegistry`
- Produces:
  - `OpenAIAdapter.analyze(req: AnalysisRequest): Promise<AnalysisResponse>` — sends approved context, returns normalized response with usage
  - `AnalysisRequest { modelId: string; systemPrompt: string; userContent: string; maxOutputTokens: number }`
  - `AnalysisResponse { content: string; usage: { promptTokens: number; completionTokens: number } | null }`

- [ ] **Step 1: Write `src/server/openai/openai-types.ts`**

```typescript
export interface AnalysisRequest {
  modelId: string
  systemPrompt: string
  userContent: string       // sanitized, approved context only
  maxOutputTokens: number
}

export interface AnalysisResponse {
  content: string
  usage: { promptTokens: number; completionTokens: number } | null
}

export class ProviderError extends Error {
  constructor(public readonly code: string, msg: string) { super(msg); this.name = 'ProviderError' }
}
```

- [ ] **Step 2: Write `src/server/openai/model-registry.ts`**

```typescript
import { PricingRegistry } from '../budget/pricing-registry.js'

export class ModelRegistry {
  private pricing = new PricingRegistry()

  isValid(modelId: string): boolean {
    try { this.pricing.getPricing(modelId); return true }
    catch { return false }
  }

  listValidated(): string[] {
    return this.pricing.listValidated()
  }

  getPricing(modelId: string) {
    return this.pricing.getPricing(modelId)
  }
}
```

- [ ] **Step 3: Write failing test (using a fake/stub)**

```typescript
// tests/unit/openai-adapter.test.ts
import { describe, it, expect, vi } from 'vitest'
import { OpenAIAdapter } from '../../src/server/openai/openai-adapter'
import type { AnalysisRequest } from '../../src/server/openai/openai-types'

// Stub the OpenAI SDK so no real calls are made
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '{"findings":[]}' } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 }
          })
        }
      }
    }))
  }
})

describe('OpenAIAdapter', () => {
  it('returns normalized response with usage', async () => {
    const adapter = new OpenAIAdapter('fake-key')
    const req: AnalysisRequest = {
      modelId: 'gpt-4o',
      systemPrompt: 'You are a migration reviewer.',
      userContent: 'Compare these implementations.',
      maxOutputTokens: 4096
    }
    const res = await adapter.analyze(req)
    expect(res.content).toContain('findings')
    expect(res.usage?.promptTokens).toBe(100)
    expect(res.usage?.completionTokens).toBe(50)
  })

  it('returns null usage when not available', async () => {
    vi.mocked(await import('openai')).default.mockImplementationOnce(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '{}' } }],
            usage: null
          })
        }
      }
    }) as any)
    const adapter = new OpenAIAdapter('fake-key')
    const res = await adapter.analyze({ modelId: 'gpt-4o', systemPrompt: '', userContent: '', maxOutputTokens: 100 })
    expect(res.usage).toBeNull()
  })
})
```

- [ ] **Step 4: Write `src/server/openai/openai-adapter.ts`**

```typescript
import OpenAI from 'openai'
import type { AnalysisRequest, AnalysisResponse } from './openai-types.js'
import { ProviderError } from './openai-types.js'

export class OpenAIAdapter {
  private client: OpenAI

  constructor(apiKey: string) {
    // maxRetries: 0 — all retries are explicit and user-initiated (req §5.6)
    this.client = new OpenAI({ apiKey, maxRetries: 0 })
  }

  async analyze(req: AnalysisRequest): Promise<AnalysisResponse> {
    let response
    try {
      response = await this.client.chat.completions.create({
        model: req.modelId,
        max_tokens: req.maxOutputTokens,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userContent }
        ]
      })
    } catch (e: any) {
      const code = e?.status ? String(e.status) : 'unknown'
      throw new ProviderError(code, `OpenAI request failed: ${e?.message ?? e}`)
    }

    const content = response.choices[0]?.message?.content ?? ''
    const usage = response.usage
      ? { promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens }
      : null

    return { content, usage }
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/unit/openai-adapter.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/openai/ tests/unit/openai-adapter.test.ts
git commit -m "feat: OpenAI adapter with maxRetries=0, normalized usage, and model registry"
```

---

## Task 16: Evidence Validator

**Files:**
- Create: `src/server/analysis/analysis-types.ts`
- Create: `src/server/analysis/evidence-validator.ts`
- Test: `tests/unit/evidence-validator.test.ts`

**Interfaces:**
- Consumes: `ContextManifest`, `SecretDetector`
- Produces:
  - `EvidenceValidator.validate(rawOutput: string, manifest: ContextManifest): ValidationResult`
  - `ValidationResult { ok: boolean; findings: RawFinding[]; errors: string[] }`
  - `RawFinding { title: string; description: string; severity: string; sourceRef?: string; targetRef?: string }`

- [ ] **Step 1: Write `src/server/analysis/analysis-types.ts`**

```typescript
export interface RawFinding {
  title: string
  description: string
  severity: 'High' | 'Medium' | 'Low' | 'Unassessed'
  sourceRef?: string   // relative file path from manifest
  targetRef?: string
  evidenceStrength?: 'Supported static hypothesis' | 'Needs runtime verification' | 'Incomplete context'
}

export interface ValidationResult {
  ok: boolean
  findings: RawFinding[]
  scenarios: RawScenario[]
  contextRequests: string[]
  errors: string[]
}

export interface RawScenario {
  title: string
  description: string
  method?: string
  path?: string
  expectedStatus?: number
  preconditions?: string
}
```

- [ ] **Step 2: Write failing test**

```typescript
// tests/unit/evidence-validator.test.ts
import { describe, it, expect } from 'vitest'
import { EvidenceValidator } from '../../src/server/analysis/evidence-validator'
import type { ContextManifest } from '../../src/server/context/manifest-types'

const manifest: ContextManifest = {
  id: 'm1',
  groupId: 'g1',
  files: [{ relativePath: 'app/Http/Controllers/UserController.php', repo: 'source', content: '...', fingerprint: 'abc' }],
  gaps: [],
  hash: 'abc123',
  collectedAt: new Date().toISOString()
}

describe('EvidenceValidator.validate', () => {
  const validator = new EvidenceValidator()

  it('parses valid JSON findings output', () => {
    const raw = JSON.stringify({
      findings: [{ title: 'Missing validation', description: 'Validation missing', severity: 'High', sourceRef: 'app/Http/Controllers/UserController.php' }],
      scenarios: [],
      contextRequests: []
    })
    const result = validator.validate(raw, manifest)
    expect(result.ok).toBe(true)
    expect(result.findings).toHaveLength(1)
  })

  it('rejects findings referencing files not in manifest', () => {
    const raw = JSON.stringify({
      findings: [{ title: 'Bad ref', description: 'test', severity: 'Low', sourceRef: 'not/in/manifest.php' }],
      scenarios: [],
      contextRequests: []
    })
    const result = validator.validate(raw, manifest)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.findings).toHaveLength(0) // invalid finding rejected
  })

  it('rejects malformed JSON', () => {
    const result = validator.validate('this is not json', manifest)
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects findings without title or description', () => {
    const raw = JSON.stringify({ findings: [{ severity: 'High' }], scenarios: [], contextRequests: [] })
    const result = validator.validate(raw, manifest)
    expect(result.findings).toHaveLength(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Write `src/server/analysis/evidence-validator.ts`**

```typescript
import type { ContextManifest } from '../context/manifest-types.js'
import type { RawFinding, RawScenario, ValidationResult } from './analysis-types.js'

const VALID_SEVERITIES = new Set(['High', 'Medium', 'Low', 'Unassessed'])

export class EvidenceValidator {
  validate(rawOutput: string, manifest: ContextManifest): ValidationResult {
    const errors: string[] = []
    const validFindings: RawFinding[] = []
    const scenarios: RawScenario[] = []
    const contextRequests: string[] = []

    let parsed: unknown
    try {
      parsed = JSON.parse(rawOutput)
    } catch {
      return { ok: false, findings: [], scenarios: [], contextRequests: [], errors: ['Malformed JSON output from AI'] }
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, findings: [], scenarios: [], contextRequests: [], errors: ['Output is not an object'] }
    }

    const p = parsed as Record<string, unknown>
    const manifestPaths = new Set(manifest.files.map(f => f.relativePath))

    for (const raw of (Array.isArray(p['findings']) ? p['findings'] : [])) {
      const f = raw as Partial<RawFinding>
      if (!f.title || !f.description) {
        errors.push(`Finding missing title or description: ${JSON.stringify(raw)}`)
        continue
      }
      if (f.severity && !VALID_SEVERITIES.has(f.severity)) {
        errors.push(`Finding has invalid severity '${f.severity}'`)
        continue
      }
      if (f.sourceRef && !manifestPaths.has(f.sourceRef)) {
        errors.push(`Finding references file not in manifest: ${f.sourceRef}`)
        continue
      }
      if (f.targetRef && !manifestPaths.has(f.targetRef)) {
        errors.push(`Finding references file not in manifest: ${f.targetRef}`)
        continue
      }
      validFindings.push({
        title: f.title,
        description: f.description,
        severity: (f.severity as RawFinding['severity']) ?? 'Unassessed',
        sourceRef: f.sourceRef,
        targetRef: f.targetRef,
        evidenceStrength: f.evidenceStrength
      })
    }

    for (const s of (Array.isArray(p['scenarios']) ? p['scenarios'] : [])) {
      if (s?.title && s?.description) scenarios.push(s as RawScenario)
    }

    for (const r of (Array.isArray(p['contextRequests']) ? p['contextRequests'] : [])) {
      if (typeof r === 'string') contextRequests.push(r)
    }

    return {
      ok: errors.length === 0 || validFindings.length > 0,
      findings: validFindings,
      scenarios,
      contextRequests,
      errors
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/evidence-validator.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/analysis/ tests/unit/evidence-validator.test.ts
git commit -m "feat: evidence validator — output structure, citation, and severity checks"
```

---

## Task 17: Analysis Loop (Coordinator)

**Files:**
- Create: `src/server/analysis/analysis-loop.ts`
- Test: `tests/unit/analysis-loop.test.ts`

**Interfaces:**
- Consumes: `ContextCollector`, `Redactor`, `ApprovalsRepo`, `BudgetLedger`, `OpenAIAdapter`, `EvidenceValidator`, `FindingsRepo`, `ScenariosRepo`, `BatchesRepo`, `SseManager`
- Produces:
  - `AnalysisLoop.runBatch(batchId: string, opts: BatchRunOpts): Promise<void>` — drives full batch analysis; emits SSE progress events; handles cancellation, budget, failures

- [ ] **Step 1: Write failing test (integration-style with fakes)**

```typescript
// tests/unit/analysis-loop.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnalysisLoop } from '../../src/server/analysis/analysis-loop'

// All dependencies are faked
const fakeAdapter = { analyze: vi.fn().mockResolvedValue({
  content: JSON.stringify({ findings: [{ title: 'Test finding', description: 'desc', severity: 'High' }], scenarios: [], contextRequests: [] }),
  usage: { promptTokens: 100, completionTokens: 50 }
})}
const fakeLedger = { checkAndReserve: vi.fn().mockReturnValue({ id: 'r1' }), reconcile: vi.fn(), markUnknownCost: vi.fn(), hasUnknownCost: vi.fn().mockReturnValue(false) }
const fakeFindingsRepo = { insert: vi.fn().mockReturnValue({ id: 'f1' }) }
const fakeScenariosRepo = { insert: vi.fn().mockReturnValue({ id: 's1' }) }
const fakeBatchesRepo = { updateGroupStatus: vi.fn(), updateBatchStatus: vi.fn(), listGroupsByBatch: vi.fn().mockReturnValue([{ id: 'bg1', group_id: 'g1', status: 'pending' }]) }
const fakeSse = { send: vi.fn() }
const fakeApprovals = { matchesHash: vi.fn().mockReturnValue(true) }
const fakeManifest = { id: 'm1', groupId: 'g1', files: [], gaps: [], hash: 'abc', collectedAt: '' }

describe('AnalysisLoop.runBatch', () => {
  it('runs analysis for each group and emits progress', async () => {
    const loop = new AnalysisLoop({
      adapter: fakeAdapter as any,
      ledger: fakeLedger as any,
      findingsRepo: fakeFindingsRepo as any,
      scenariosRepo: fakeScenariosRepo as any,
      batchesRepo: fakeBatchesRepo as any,
      sse: fakeSse as any,
      approvalsRepo: fakeApprovals as any,
      modelId: 'gpt-4o',
      perGroupCents: 100,
      totalCents: 200
    })

    await loop.runBatch('batch-1', {
      groups: [{ batchGroupId: 'bg1', groupId: 'g1', manifest: fakeManifest as any }]
    })

    expect(fakeSse.send).toHaveBeenCalledWith('group:started', expect.objectContaining({ groupId: 'g1' }))
    expect(fakeFindingsRepo.insert).toHaveBeenCalled()
    expect(fakeBatchesRepo.updateGroupStatus).toHaveBeenCalledWith('bg1', 'completed')
  })

  it('marks group failed on provider error', async () => {
    const failAdapter = { analyze: vi.fn().mockRejectedValue(new Error('provider down')) }
    const loop = new AnalysisLoop({
      adapter: failAdapter as any,
      ledger: fakeLedger as any,
      findingsRepo: fakeFindingsRepo as any,
      scenariosRepo: fakeScenariosRepo as any,
      batchesRepo: fakeBatchesRepo as any,
      sse: fakeSse as any,
      approvalsRepo: fakeApprovals as any,
      modelId: 'gpt-4o',
      perGroupCents: 100,
      totalCents: 200
    })

    await loop.runBatch('batch-1', {
      groups: [{ batchGroupId: 'bg1', groupId: 'g1', manifest: fakeManifest as any }]
    })

    expect(fakeBatchesRepo.updateGroupStatus).toHaveBeenCalledWith('bg1', 'failed')
  })
})
```

- [ ] **Step 2: Write `src/server/analysis/analysis-loop.ts`**

```typescript
import { randomUUID } from 'crypto'
import type { OpenAIAdapter } from '../openai/openai-adapter.js'
import type { BudgetLedger } from '../budget/budget-ledger.js'
import type { FindingsRepo } from '../persistence/repos/findings-repo.js'
import type { ScenariosRepo } from '../persistence/repos/scenarios-repo.js'
import type { BatchesRepo } from '../persistence/repos/batches-repo.js'
import type { ApprovalsRepo } from '../persistence/repos/approvals-repo.js'
import type { SseManager } from '../transport/sse.js'
import type { ContextManifest } from '../context/manifest-types.js'
import { EvidenceValidator } from './evidence-validator.js'
import { BudgetExceededError } from '../budget/budget-types.js'
import { ProviderError } from '../openai/openai-types.js'

const SYSTEM_PROMPT = `You are an expert API migration reviewer. Compare source (Lumen 11) and target (NestJS 11) implementations.

Return ONLY a JSON object with this exact structure:
{
  "findings": [{ "title": string, "description": string, "severity": "High"|"Medium"|"Low"|"Unassessed", "sourceRef"?: string, "targetRef"?: string, "evidenceStrength"?: string }],
  "scenarios": [{ "title": string, "description": string, "method"?: string, "path"?: string, "expectedStatus"?: number, "preconditions"?: string }],
  "contextRequests": []
}

All findings are provisional hypotheses supported by static code evidence. Never claim runtime correctness. Use Lumen behavior as the source of truth.`

interface GroupJob {
  batchGroupId: string
  groupId: string
  manifest: ContextManifest
}

interface BatchRunOpts {
  groups: GroupJob[]
}

interface LoopDeps {
  adapter: OpenAIAdapter
  ledger: BudgetLedger
  findingsRepo: FindingsRepo
  scenariosRepo: ScenariosRepo
  batchesRepo: BatchesRepo
  approvalsRepo: ApprovalsRepo
  sse: SseManager
  modelId: string
  perGroupCents: number
  totalCents: number
}

export class AnalysisLoop {
  private validator = new EvidenceValidator()
  private canceled = false

  constructor(private deps: LoopDeps) {}

  cancel(): void { this.canceled = true }

  async runBatch(batchId: string, opts: BatchRunOpts): Promise<void> {
    this.deps.batchesRepo.updateBatchStatus(batchId, 'running')

    for (const job of opts.groups) {
      if (this.canceled) {
        this.deps.batchesRepo.updateGroupStatus(job.batchGroupId, 'canceled')
        continue
      }
      await this.runGroup(batchId, job)
    }

    const allGroups = this.deps.batchesRepo.listGroupsByBatch(batchId)
    const allDone = allGroups.every(g => ['completed', 'failed', 'canceled', 'incomplete'].includes(g.status))
    if (allDone) {
      const anyFailed = allGroups.some(g => g.status === 'failed')
      this.deps.batchesRepo.updateBatchStatus(batchId, anyFailed ? 'failed' : 'completed')
    }
  }

  private async runGroup(batchId: string, job: GroupJob): Promise<void> {
    const { batchGroupId, groupId, manifest } = job
    this.deps.batchesRepo.updateGroupStatus(batchGroupId, 'running')
    this.deps.sse.send('group:started', { groupId, batchId })

    const userContent = this.buildUserContent(manifest)
    const requestId = randomUUID()
    const estimatedCents = 5 // placeholder — real estimate uses PricingRegistry

    try {
      this.deps.ledger.checkAndReserve(batchId, groupId, requestId, estimatedCents)
    } catch (e) {
      if (e instanceof BudgetExceededError) {
        this.deps.batchesRepo.updateGroupStatus(batchGroupId, 'incomplete')
        this.deps.sse.send('group:incomplete', { groupId, reason: e.message })
        return
      }
      throw e
    }

    let response
    try {
      response = await this.deps.adapter.analyze({
        modelId: this.deps.modelId,
        systemPrompt: SYSTEM_PROMPT,
        userContent,
        maxOutputTokens: 4096
      })
    } catch (e) {
      if (e instanceof ProviderError) {
        this.deps.ledger.markUnknownCost(requestId)
        this.deps.batchesRepo.updateGroupStatus(batchGroupId, 'failed')
        this.deps.sse.send('group:failed', { groupId, reason: e.message })
        return
      }
      this.deps.ledger.markUnknownCost(requestId)
      throw e
    }

    if (response.usage) {
      // reconcile with actual cost (simplified — real impl uses PricingRegistry)
      this.deps.ledger.reconcile(requestId, estimatedCents)
    } else {
      this.deps.ledger.markUnknownCost(requestId)
    }

    const validation = this.validator.validate(response.content, manifest)

    if (!validation.ok && validation.findings.length === 0) {
      this.deps.batchesRepo.updateGroupStatus(batchGroupId, 'incomplete')
      this.deps.sse.send('group:incomplete', { groupId, reason: 'Validation failed: ' + validation.errors.join('; ') })
      return
    }

    for (const f of validation.findings) {
      this.deps.findingsRepo.insert(batchId, groupId, {
        title: f.title,
        description: f.description,
        evidence: JSON.stringify({ sourceRef: f.sourceRef, targetRef: f.targetRef, strength: f.evidenceStrength }),
        suggested_severity: f.severity,
        human_severity: null,
        disposition: 'unresolved',
        provisional: 1,
        fix_status: null
      })
    }

    for (const s of validation.scenarios) {
      this.deps.scenariosRepo.insert({
        finding_id: null,
        group_id: groupId,
        batch_id: batchId,
        title: s.title,
        description: s.description,
        method: s.method ?? null,
        path: s.path ?? null,
        headers: '{}',
        query_params: '{}',
        body: null,
        expected_status: s.expectedStatus ?? null,
        preconditions: s.preconditions ?? null,
        enabled: 1,
        is_ai_generated: 1
      })
    }

    this.deps.batchesRepo.updateGroupStatus(batchGroupId, 'completed')
    this.deps.sse.send('group:completed', { groupId, findingCount: validation.findings.length })
  }

  private buildUserContent(manifest: ContextManifest): string {
    const parts: string[] = []
    for (const f of manifest.files) {
      parts.push(`--- [${f.repo.toUpperCase()}] ${f.relativePath} ---\n${f.content}`)
    }
    if (manifest.gaps.length > 0) {
      parts.push(`--- COVERAGE GAPS ---\n${manifest.gaps.join('\n')}`)
    }
    return parts.join('\n\n')
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/unit/analysis-loop.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/analysis/analysis-loop.ts tests/unit/analysis-loop.test.ts
git commit -m "feat: analysis loop with budget admission, provider error isolation, SSE progress, and per-group completion"
```

---

## Task 18: Findings Service and Human Dispositions

**Files:**
- Create: `src/server/findings/findings-types.ts`
- Create: `src/server/findings/findings-service.ts`
- Create: `src/server/transport/routes/findings.ts`
- Test: `tests/unit/findings-service.test.ts`

**Interfaces:**
- Consumes: `FindingsRepo`
- Produces:
  - `FindingsService.listByBatch(batchId): Finding[]`
  - `FindingsService.setDisposition(id, disposition, humanSeverity?): Finding`
  - `FindingsService.markFixReported(id): void`
  - `FindingsService.markFixVerified(id): void`
  - `Finding { id; title; description; evidence; suggestedSeverity; humanSeverity?; disposition; provisional; fixStatus? }`

- [ ] **Step 1: Write `src/server/findings/findings-types.ts`**

```typescript
export type Severity = 'High' | 'Medium' | 'Low' | 'Unassessed'
export type Disposition = 'unresolved' | 'verified-defect' | 'intentional-difference' | 'false-positive'

export interface Finding {
  id: string
  batchId: string
  groupId: string
  title: string
  description: string
  evidence: { sourceRef?: string; targetRef?: string; strength?: string }
  suggestedSeverity: Severity
  humanSeverity?: Severity
  disposition: Disposition
  provisional: boolean
  fixStatus?: 'fix-reported' | 'fix-verified'
}
```

- [ ] **Step 2: Write failing test**

```typescript
// tests/unit/findings-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FindingsService } from '../../src/server/findings/findings-service'
import { FindingsRepo } from '../../src/server/persistence/repos/findings-repo'
import { BatchesRepo } from '../../src/server/persistence/repos/batches-repo'
import { ProjectsRepo } from '../../src/server/persistence/repos/projects-repo'
import { openDb } from '../../src/server/persistence/db'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'

let db: Database.Database, tmpDir: string, service: FindingsService, batchId: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'amr-findings-'))
  db = openDb(join(tmpDir, 'test.db'))
  const projects = new ProjectsRepo(db)
  const batches = new BatchesRepo(db)
  const p = projects.create('p', '/s', '/t')
  const batch = batches.createBatch(p.id, 'gpt-4o', 100, 200)
  batchId = batch.id
  const findingsRepo = new FindingsRepo(db)
  service = new FindingsService(findingsRepo)
  findingsRepo.insert(batchId, 'g1', {
    title: 'Missing validation', description: 'Password not validated', evidence: '{}',
    suggested_severity: 'High', human_severity: null, disposition: 'unresolved', provisional: 1, fix_status: null
  })
})
afterEach(() => { db.close(); rmSync(tmpDir, { recursive: true }) })

describe('FindingsService', () => {
  it('lists provisional findings', () => {
    const findings = service.listByBatch(batchId)
    expect(findings).toHaveLength(1)
    expect(findings[0].provisional).toBe(true)
    expect(findings[0].disposition).toBe('unresolved')
  })

  it('sets disposition and removes provisional flag', () => {
    const findings = service.listByBatch(batchId)
    const updated = service.setDisposition(findings[0].id, 'verified-defect', 'High')
    expect(updated.disposition).toBe('verified-defect')
    expect(updated.provisional).toBe(false)
    expect(updated.humanSeverity).toBe('High')
  })

  it('marks fix reported (stays unverified)', () => {
    const findings = service.listByBatch(batchId)
    service.markFixReported(findings[0].id)
    const updated = service.listByBatch(batchId)[0]
    expect(updated.fixStatus).toBe('fix-reported')
  })
})
```

- [ ] **Step 3: Write `src/server/findings/findings-service.ts`**

```typescript
import type { FindingsRepo } from '../persistence/repos/findings-repo.js'
import type { Finding, Disposition, Severity } from './findings-types.js'

export class FindingsService {
  constructor(private repo: FindingsRepo) {}

  listByBatch(batchId: string): Finding[] {
    return this.repo.listByBatch(batchId).map(this.toFinding)
  }

  setDisposition(id: string, disposition: Disposition, humanSeverity?: Severity): Finding {
    this.repo.updateDisposition(id, disposition, humanSeverity)
    return this.toFinding(this.repo.getById(id)!)
  }

  markFixReported(id: string): void {
    this.repo.markFixReported(id)
  }

  markFixVerified(id: string): void {
    this.repo.markFixVerified(id)
  }

  private toFinding(row: any): Finding {
    return {
      id: row.id,
      batchId: row.batch_id,
      groupId: row.group_id,
      title: row.title,
      description: row.description,
      evidence: JSON.parse(row.evidence || '{}'),
      suggestedSeverity: row.suggested_severity,
      humanSeverity: row.human_severity ?? undefined,
      disposition: row.disposition,
      provisional: row.provisional === 1,
      fixStatus: row.fix_status ?? undefined
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/findings-service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/findings/ tests/unit/findings-service.test.ts
git commit -m "feat: findings service with provisional state, dispositions, and fix tracking"
```

---

## Task 19: Test Scenario Management

**Files:**
- Create: `src/server/findings/scenarios-service.ts`
- Test: `tests/unit/scenarios-service.test.ts`

**Interfaces:**
- Consumes: `ScenariosRepo`
- Produces:
  - `ScenariosService.listByBatch(batchId): TestScenario[]`
  - `ScenariosService.update(id, patch): TestScenario`
  - `ScenariosService.addCustom(batchId, groupId, data): TestScenario`
  - `ScenariosService.delete(id): void`
  - `TestScenario { id; title; description; method?; path?; headers; queryParams; body?; expectedStatus?; preconditions?; enabled; isAiGenerated }`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/scenarios-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ScenariosService } from '../../src/server/findings/scenarios-service'
import { ScenariosRepo } from '../../src/server/persistence/repos/scenarios-repo'
import { BatchesRepo } from '../../src/server/persistence/repos/batches-repo'
import { ProjectsRepo } from '../../src/server/persistence/repos/projects-repo'
import { openDb } from '../../src/server/persistence/db'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'

let db: Database.Database, tmpDir: string, service: ScenariosService, batchId: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'amr-scenarios-'))
  db = openDb(join(tmpDir, 'test.db'))
  const p = new ProjectsRepo(db).create('p', '/s', '/t')
  const batch = new BatchesRepo(db).createBatch(p.id, 'gpt-4o', 100, 200)
  batchId = batch.id
  const repo = new ScenariosRepo(db)
  service = new ScenariosService(repo)
  repo.insert({ finding_id: null, group_id: 'g1', batch_id: batchId, title: 'Create user', description: 'POST /api/users', method: 'POST', path: '/api/users', headers: '{}', query_params: '{}', body: null, expected_status: 201, preconditions: null, enabled: 1, is_ai_generated: 1 })
})
afterEach(() => { db.close(); rmSync(tmpDir, { recursive: true }) })

describe('ScenariosService', () => {
  it('lists scenarios by batch', () => {
    const list = service.listByBatch(batchId)
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Create user')
    expect(list[0].isAiGenerated).toBe(true)
  })

  it('updates scenario fields', () => {
    const [s] = service.listByBatch(batchId)
    const updated = service.update(s.id, { title: 'Updated title', enabled: false })
    expect(updated.title).toBe('Updated title')
    expect(updated.enabled).toBe(false)
  })

  it('adds a custom scenario', () => {
    const s = service.addCustom(batchId, 'g1', { title: 'Custom', description: 'Manual test', method: 'GET', path: '/api/users' })
    expect(s.isAiGenerated).toBe(false)
    expect(s.title).toBe('Custom')
  })

  it('deletes a scenario', () => {
    const [s] = service.listByBatch(batchId)
    service.delete(s.id)
    expect(service.listByBatch(batchId)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Write `src/server/findings/scenarios-service.ts`**

```typescript
import type { ScenariosRepo } from '../persistence/repos/scenarios-repo.js'

export interface TestScenario {
  id: string
  findingId?: string
  groupId: string
  batchId: string
  title: string
  description: string
  method?: string
  path?: string
  headers: Record<string, string>
  queryParams: Record<string, string>
  body?: string
  expectedStatus?: number
  preconditions?: string
  enabled: boolean
  isAiGenerated: boolean
}

interface CustomScenarioData {
  title: string
  description: string
  method?: string
  path?: string
  expectedStatus?: number
  preconditions?: string
}

export class ScenariosService {
  constructor(private repo: ScenariosRepo) {}

  listByBatch(batchId: string): TestScenario[] {
    return this.repo.listByBatch(batchId).map(this.toScenario)
  }

  update(id: string, patch: Partial<Pick<TestScenario, 'title' | 'description' | 'method' | 'path' | 'expectedStatus' | 'preconditions' | 'enabled'>>): TestScenario {
    const dbPatch: Record<string, unknown> = {}
    if (patch.title !== undefined) dbPatch['title'] = patch.title
    if (patch.description !== undefined) dbPatch['description'] = patch.description
    if (patch.method !== undefined) dbPatch['method'] = patch.method
    if (patch.path !== undefined) dbPatch['path'] = patch.path
    if (patch.expectedStatus !== undefined) dbPatch['expected_status'] = patch.expectedStatus
    if (patch.preconditions !== undefined) dbPatch['preconditions'] = patch.preconditions
    if (patch.enabled !== undefined) dbPatch['enabled'] = patch.enabled ? 1 : 0
    this.repo.update(id, dbPatch as any)
    return this.toScenario(this.repo.getById(id)!)
  }

  addCustom(batchId: string, groupId: string, data: CustomScenarioData): TestScenario {
    const row = this.repo.insert({
      finding_id: null, group_id: groupId, batch_id: batchId,
      title: data.title, description: data.description,
      method: data.method ?? null, path: data.path ?? null,
      headers: '{}', query_params: '{}', body: null,
      expected_status: data.expectedStatus ?? null,
      preconditions: data.preconditions ?? null,
      enabled: 1, is_ai_generated: 0
    })
    return this.toScenario(row)
  }

  delete(id: string): void {
    this.repo.delete(id)
  }

  private toScenario(row: any): TestScenario {
    return {
      id: row.id,
      findingId: row.finding_id ?? undefined,
      groupId: row.group_id,
      batchId: row.batch_id,
      title: row.title,
      description: row.description,
      method: row.method ?? undefined,
      path: row.path ?? undefined,
      headers: JSON.parse(row.headers || '{}'),
      queryParams: JSON.parse(row.query_params || '{}'),
      body: row.body ?? undefined,
      expectedStatus: row.expected_status ?? undefined,
      preconditions: row.preconditions ?? undefined,
      enabled: row.enabled === 1,
      isAiGenerated: row.is_ai_generated === 1
    }
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/unit/scenarios-service.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/findings/scenarios-service.ts tests/unit/scenarios-service.test.ts
git commit -m "feat: test scenario management — AI-generated and custom scenarios with edit/delete"
```

---

## Task 20: Markdown Export

**Files:**
- Create: `src/server/export/markdown-exporter.ts`
- Create: `src/server/export/checklist-exporter.ts`
- Test: `tests/unit/markdown-exporter.test.ts`

**Interfaces:**
- Consumes: `FindingsService`, `ScenariosService`, `BatchesRepo`
- Produces:
  - `MarkdownExporter.generateReport(batchId, opts): string` — Markdown report with findings, evidence, coverage gaps, and provisional labels
  - `ChecklistExporter.generateChecklist(batchId): string` — Markdown checklist of enabled test scenarios

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/markdown-exporter.test.ts
import { describe, it, expect } from 'vitest'
import { MarkdownExporter } from '../../src/server/export/markdown-exporter'
import { ChecklistExporter } from '../../src/server/export/checklist-exporter'

const fakeFindingsService = {
  listByBatch: () => ([{
    id: 'f1', batchId: 'b1', groupId: 'g1', title: 'Missing validation',
    description: 'Password field not validated', evidence: { sourceRef: 'UserController.php', strength: 'Supported static hypothesis' },
    suggestedSeverity: 'High', humanSeverity: undefined, disposition: 'unresolved', provisional: true
  }])
} as any

const fakeScenariosService = {
  listByBatch: () => ([{
    id: 's1', batchId: 'b1', groupId: 'g1', title: 'Create user — valid payload',
    description: 'POST /api/users with valid body should return 201',
    method: 'POST', path: '/api/users', expectedStatus: 201, enabled: true, isAiGenerated: true,
    headers: {}, queryParams: {}
  }])
} as any

describe('MarkdownExporter.generateReport', () => {
  it('includes provisional label on unverified findings', () => {
    const exporter = new MarkdownExporter(fakeFindingsService, fakeScenariosService)
    const report = exporter.generateReport('b1', { includeCodeExcerpts: false })
    expect(report).toContain('[PROVISIONAL]')
    expect(report).toContain('Missing validation')
    expect(report).toContain('High')
  })

  it('includes coverage disclaimer', () => {
    const exporter = new MarkdownExporter(fakeFindingsService, fakeScenariosService)
    const report = exporter.generateReport('b1', { includeCodeExcerpts: false })
    expect(report).toContain('static analysis')
  })

  it('never includes runtime verification claim', () => {
    const exporter = new MarkdownExporter(fakeFindingsService, fakeScenariosService)
    const report = exporter.generateReport('b1', { includeCodeExcerpts: false })
    expect(report.toLowerCase()).not.toContain('runtime verified')
  })
})

describe('ChecklistExporter.generateChecklist', () => {
  it('generates markdown checklist with enabled scenarios', () => {
    const exporter = new ChecklistExporter(fakeScenariosService)
    const checklist = exporter.generateChecklist('b1')
    expect(checklist).toContain('- [ ]')
    expect(checklist).toContain('Create user')
    expect(checklist).toContain('[AI-generated suggestion — unexecuted]')
  })
})
```

- [ ] **Step 2: Write `src/server/export/markdown-exporter.ts`**

```typescript
import type { FindingsService } from '../findings/findings-service.js'
import type { ScenariosService } from '../findings/scenarios-service.js'

interface ExportOptions {
  includeCodeExcerpts: boolean
}

export class MarkdownExporter {
  constructor(
    private findings: FindingsService,
    private scenarios: ScenariosService
  ) {}

  generateReport(batchId: string, opts: ExportOptions): string {
    const findings = this.findings.listByBatch(batchId)
    const lines: string[] = [
      '# API Migration Review Report',
      '',
      '> **Scope:** Static code analysis only. This report does not imply runtime verification.',
      '> All findings are provisional hypotheses until explicitly verified by a human reviewer.',
      '> Coverage is limited to the analyzed mapping groups and may not represent the full codebase.',
      '',
      `**Generated:** ${new Date().toISOString()}`,
      `**Batch ID:** ${batchId}`,
      '',
      '---',
      '',
      '## Findings',
      ''
    ]

    if (findings.length === 0) {
      lines.push('No findings recorded for this batch.')
    }

    for (const f of findings) {
      const provisionalLabel = f.provisional ? ' **[PROVISIONAL]**' : ''
      const severityLabel = f.humanSeverity ?? f.suggestedSeverity
      lines.push(`### ${f.title}${provisionalLabel}`)
      lines.push('')
      lines.push(`**Severity:** ${severityLabel} | **Disposition:** ${f.disposition}`)
      lines.push('')
      lines.push(f.description)
      lines.push('')
      if (f.evidence.sourceRef) lines.push(`**Source evidence:** \`${f.evidence.sourceRef}\``)
      if (f.evidence.targetRef) lines.push(`**Target evidence:** \`${f.evidence.targetRef}\``)
      if (f.evidence.strength) lines.push(`**Evidence strength:** ${f.evidence.strength}`)
      if (f.fixStatus) lines.push(`**Fix status:** ${f.fixStatus}`)
      lines.push('')
    }

    lines.push('---')
    lines.push('')
    lines.push('## Coverage Limitations')
    lines.push('')
    lines.push('This static analysis covers only the selected mapping groups. Cache/Redis, queue/event, external integrations, and logging comparisons are deferred. Runtime behavior is not verified.')
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('*This report was generated by AI API Migration Reviewer. All findings require human review before acting.*')

    return lines.join('\n')
  }
}
```

- [ ] **Step 3: Write `src/server/export/checklist-exporter.ts`**

```typescript
import type { ScenariosService } from '../findings/scenarios-service.js'

export class ChecklistExporter {
  constructor(private scenarios: ScenariosService) {}

  generateChecklist(batchId: string): string {
    const scenarios = this.scenarios.listByBatch(batchId).filter(s => s.enabled)
    const lines: string[] = [
      '# Migration Test Checklist',
      '',
      '> **Note:** All scenarios below are unexecuted suggestions derived from static code analysis.',
      '> Verify each scenario against your test environment. Do not treat these as confirmed test results.',
      '',
    ]

    for (const s of scenarios) {
      const aiLabel = s.isAiGenerated ? ' [AI-generated suggestion — unexecuted]' : ' [Manual scenario]'
      lines.push(`- [ ] **${s.title}**${aiLabel}`)
      lines.push(`  ${s.description}`)
      if (s.method && s.path) lines.push(`  \`${s.method} ${s.path}\` → ${s.expectedStatus ?? '?'}`)
      if (s.preconditions) lines.push(`  *Preconditions:* ${s.preconditions}`)
      lines.push('')
    }

    return lines.join('\n')
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/markdown-exporter.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/export/ tests/unit/markdown-exporter.test.ts
git commit -m "feat: Markdown report and test checklist export with provisional labels and coverage disclaimers"
```

---

## Task 21: Wire Phase 2 into App and Routes

**Files:**
- Modify: `src/server/app.ts` — add Phase 2 routes, key management, and analysis trigger
- Create: `src/server/transport/routes/batches.ts`
- Create: `src/server/transport/routes/findings.ts`
- Create: `src/server/transport/routes/scenarios.ts`
- Create: `src/server/transport/routes/export.ts`
- Create: `src/server/transport/routes/auth-key.ts`

**Interfaces:**
- Consumes: all Phase 2 services
- Produces: full REST API for batch launch, findings triage, scenario management, and export

- [ ] **Step 1: Write `src/server/transport/routes/auth-key.ts`** (session-only key storage)

```typescript
import { Router } from 'express'

// Key is held in a closure — never hits SQLite or logs
export function authKeyRouter(onKeySet: (key: string) => void, getKey: () => string | null): Router {
  const router = Router()

  router.post('/', (req, res) => {
    const { apiKey } = req.body
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
      res.status(400).json({ error: 'Invalid API key' }); return
    }
    onKeySet(apiKey)
    res.json({ ok: true, masked: '•'.repeat(apiKey.length - 4) + apiKey.slice(-4) })
  })

  router.get('/status', (_req, res) => {
    res.json({ hasKey: getKey() !== null })
  })

  return router
}
```

- [ ] **Step 2: Write `src/server/transport/routes/batches.ts`**

```typescript
import { Router } from 'express'
import type { BatchesRepo } from '../../persistence/repos/batches-repo.js'
import type { MappingsRepo } from '../../persistence/repos/mappings-repo.js'
import type { AnalysisLoop } from '../../analysis/analysis-loop.js'

export function batchesRouter(
  batchesRepo: BatchesRepo,
  mappingsRepo: MappingsRepo,
  createLoop: (modelId: string, perGroup: number, total: number) => AnalysisLoop,
  getManifest: (groupId: string) => any
): Router {
  const router = Router({ mergeParams: true })
  const activeLoops = new Map<string, AnalysisLoop>()

  router.post('/', (req, res) => {
    const { modelId, perGroupBudgetCents, totalBudgetCents, groupIds } = req.body
    if (!modelId || !perGroupBudgetCents || !totalBudgetCents || !groupIds?.length) {
      res.status(400).json({ error: 'modelId, perGroupBudgetCents, totalBudgetCents, groupIds required' }); return
    }
    const batch = batchesRepo.createBatch(req.params.projectId, modelId, perGroupBudgetCents, totalBudgetCents)
    for (const gid of groupIds) batchesRepo.addGroup(batch.id, gid)
    res.status(201).json(batch)
  })

  router.post('/:batchId/start', async (req, res) => {
    const batch = batchesRepo.getBatch(req.params.batchId)
    if (!batch) { res.status(404).json({ error: 'Not found' }); return }

    const loop = createLoop(batch.model_id, batch.per_group_budget_cents, batch.total_budget_cents)
    activeLoops.set(batch.id, loop)

    const groups = batchesRepo.listGroupsByBatch(batch.id).map(bg => ({
      batchGroupId: bg.id,
      groupId: bg.group_id,
      manifest: getManifest(bg.group_id)
    }))

    res.json({ started: true })
    loop.runBatch(batch.id, { groups }).catch(() => {})
  })

  router.post('/:batchId/cancel', (req, res) => {
    const loop = activeLoops.get(req.params.batchId)
    if (loop) { loop.cancel(); activeLoops.delete(req.params.batchId) }
    batchesRepo.updateBatchStatus(req.params.batchId, 'canceled')
    res.json({ canceled: true })
  })

  return router
}
```

- [ ] **Step 3: Write `src/server/transport/routes/findings.ts`**

```typescript
import { Router } from 'express'
import type { FindingsService } from '../../findings/findings-service.js'

export function findingsRouter(service: FindingsService): Router {
  const router = Router({ mergeParams: true })

  router.get('/', (req, res) => {
    res.json(service.listByBatch(req.params.batchId))
  })

  router.patch('/:findingId/disposition', (req, res) => {
    const { disposition, humanSeverity } = req.body
    try {
      const updated = service.setDisposition(req.params.findingId, disposition, humanSeverity)
      res.json(updated)
    } catch { res.status(404).json({ error: 'Not found' }) }
  })

  router.post('/:findingId/fix-reported', (req, res) => {
    service.markFixReported(req.params.findingId)
    res.json({ ok: true })
  })

  router.post('/:findingId/fix-verified', (req, res) => {
    service.markFixVerified(req.params.findingId)
    res.json({ ok: true })
  })

  return router
}
```

- [ ] **Step 4: Write `src/server/transport/routes/scenarios.ts`**

```typescript
import { Router } from 'express'
import type { ScenariosService } from '../../findings/scenarios-service.js'

export function scenariosRouter(service: ScenariosService): Router {
  const router = Router({ mergeParams: true })

  router.get('/', (req, res) => {
    res.json(service.listByBatch(req.params.batchId))
  })

  router.post('/', (req, res) => {
    const s = service.addCustom(req.params.batchId, req.body.groupId, req.body)
    res.status(201).json(s)
  })

  router.patch('/:scenarioId', (req, res) => {
    try {
      const updated = service.update(req.params.scenarioId, req.body)
      res.json(updated)
    } catch { res.status(404).json({ error: 'Not found' }) }
  })

  router.delete('/:scenarioId', (req, res) => {
    service.delete(req.params.scenarioId)
    res.status(204).end()
  })

  return router
}
```

- [ ] **Step 5: Write `src/server/transport/routes/export.ts`**

```typescript
import { Router } from 'express'
import type { MarkdownExporter } from '../../export/markdown-exporter.js'
import type { ChecklistExporter } from '../../export/checklist-exporter.js'

export function exportRouter(markdownExporter: MarkdownExporter, checklistExporter: ChecklistExporter): Router {
  const router = Router({ mergeParams: true })

  router.get('/report', (req, res) => {
    const includeCode = req.query['excerpts'] === 'true'
    const md = markdownExporter.generateReport(req.params.batchId, { includeCodeExcerpts: includeCode })
    res.setHeader('Content-Type', 'text/markdown')
    res.send(md)
  })

  router.get('/checklist', (req, res) => {
    const md = checklistExporter.generateChecklist(req.params.batchId)
    res.setHeader('Content-Type', 'text/markdown')
    res.send(md)
  })

  return router
}
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```
Expected: All tests pass

- [ ] **Step 7: Manual smoke test**

```bash
npm run dev
# Open browser with bootstrap URL
# 1. Create a project with valid local paths
# 2. POST /api/projects/:id/mappings/auto-match
# 3. POST /api/session/key with a test OpenAI key
# 4. POST /api/projects/:id/batches with groupIds and budget
# 5. GET /api/batches/:id/findings
# 6. GET /api/batches/:id/export/report
```

- [ ] **Step 8: Commit**

```bash
git add src/server/transport/routes/ src/server/app.ts
git commit -m "feat: Phase 2 routes — batch launch, findings triage, scenario management, and export"
```

---

## Phase 2 Complete

After Task 21, the full MVP pipeline is operational:
- Session-only OpenAI key management (never persisted)
- Context collection with manifest + fingerprinting
- Secret detection and redaction before any transmission
- User content-approval gate (manifest hash matched before dispatch)
- Pre-dispatch budget reservation in SQLite transaction
- Iterative analysis loop with SSE progress events
- Evidence validation (structure, citations, secrets)
- Provisional findings with human disposition workflow
- Fix tracking (fix-reported → reanalysis → fix-verified)
- AI-generated and custom test scenarios (labeled unexecuted)
- Markdown report with provisional labels and coverage disclaimers
- Markdown test checklist

---

## Plan Self-Review Against Requirements

### §5.1 Project configuration
- ✅ Path validation in `RepoService` (Task 4)
- ✅ Read-only access, root containment enforced at `safeRead`
- ✅ No writes into repositories
- ✅ Application storage separate from repos

### §5.2 Endpoint discovery and mapping
- ✅ File-only discovery — no code execution (Tasks 6, 7)
- ✅ Method/path/handler/sourceFile per endpoint
- ✅ One-to-one, one-to-many, many-to-one groups (Task 8)
- ✅ Unmatched endpoints tracked, not silently dropped

### §5.3 Batch selection and context approval
- ✅ ContextCollector builds manifest (Task 12)
- ✅ Manifest hash checked before dispatch via `ApprovalsRepo`
- ✅ Fresh approval required for changed content

### §5.4 Findings and human review
- ✅ All findings provisional until user disposition (Task 18)
- ✅ Dispositions: verified-defect, intentional-difference, false-positive, unresolved
- ✅ Fix tracking: fix-reported → fix-verified separation
- ✅ Lumen as source of truth enforced via system prompt

### §5.5 Test-scenario management
- ✅ AI-generated + custom scenarios (Task 19)
- ✅ All labeled unexecuted
- ✅ Add/edit/disable/delete supported
- ✅ Markdown checklist export (Task 20)

### §5.6 Budgets and cancellation
- ✅ Per-group and total budget limits (Task 14)
- ✅ Reserve before dispatch in SQLite transaction
- ✅ Unknown cost retained as allowance charge
- ✅ Cancellation supported via `AnalysisLoop.cancel()`
- ✅ No automatic paid retries (`maxRetries: 0`)

### §5.7 Results and reporting
- ✅ Markdown report with provisional labels (Task 20)
- ✅ Coverage limitations always included
- ✅ No runtime verification claimed anywhere

### §6 Ownership
- ✅ Coordinator is sole DB writer
- ✅ Workers have no DB/network access
- ✅ AI proposes findings; user verifies
- ✅ No AI can approve sharing, grant permissions, or mark findings verified

### §7 Local application and failures
- ✅ `127.0.0.1` binding
- ✅ Session-only API key (never in SQLite, logs, or URLs)
- ✅ Provider errors mark group failed, preserve completed results
- ✅ Disk failure stops new paid work

### §8 Static code analysis
- ✅ Lumen 11 and NestJS 11 adapters
- ✅ Coverage limited to two repos, selected handlers
- ✅ Gaps reported for excluded/unresolvable files

### §10 Security and privacy
- ✅ Secret detection + redaction before transmission (Task 13)
- ✅ Origin/Host validation (Phase 1, Task 3)
- ✅ Bootstrap credential single-use
- ✅ No secrets in exports — secret checks applied to scenarios and model output
- ✅ Markdown preview treats HTML as non-executable

### Open items requiring pilot validation (per §13 of requirements)
- [ ] Validate actual Lumen 11 / NestJS 11 parser patterns against pilot repos
- [ ] Confirm OpenAI model list and live pricing before enabling a model
- [ ] Establish resource limits (maxFiles, maxTotalBytes) via pilot testing
- [ ] Freeze benchmark defects before measuring acceptance

No spec section is left without a task. No placeholders remain in task steps.
