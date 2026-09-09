# Galaxy Production and Healthy Historical Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Pulso Público on Galaxy with Node.js 22 and continuously populate its PostgreSQL database with official legislative data from the current year back to 1946 at a safe, resumable rate.

**Architecture:** A standalone Next.js web process serves users while a separate local CLI reserves persistent PostgreSQL tasks and processes one official-source request stream at a conservative rate. Queue leases, cursors, idempotent upserts, bounded retries, and storage thresholds make the import resumable; candidate JPEGs move to PostgreSQL so the web container does not depend on ephemeral disk.

**Tech Stack:** Node.js 22.23.2, npm 11, Next.js 16 App Router, TypeScript 7, PostgreSQL 18, Drizzle ORM/Kit, Vitest 5, Galaxy Web Apps and Galaxy CLI.

**Spec:** `docs/superpowers/specs/2026-09-09-galaxy-production-and-historical-collector-design.md`

## Global Constraints

- Use Node.js 22 in development and production; pin local development to `22.23.2` and declare the production engine as `>=22 <23`.
- Collect Câmara and Senado data from the current year down through 1946.
- Keep electoral data limited to election year 2026.
- Default to one request stream and at most 20 request starts per minute per official source.
- Respect `Retry-After`; retry only temporary failures with exponential backoff and jitter.
- Store every committed cursor in the same transaction as its persisted batch.
- Run the historical collector on the local Mac, never in the Next.js build, startup, or request process.
- Store candidate JPEGs in PostgreSQL; keep large official PDFs as source links.
- Never log credentials, raw connection strings, secrets, or complete upstream payloads.
- Preserve the existing user change in `tests/server/public/queries.test.ts` unless the user explicitly asks to include it.

---

### Task 1: Standardize Node.js 22 and Galaxy-compatible Next.js output

**Files:**
- Modify: `.node-version`
- Modify: `.nvmrc`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `next.config.ts`
- Create: `galaxy.json`
- Create: `.galaxyignore`
- Test: `tests/deployment/runtime-config.test.ts`

**Interfaces:**
- Consumes: the existing `npm run build` and `npm start` scripts.
- Produces: a Node 22 project with `nextConfig.output === "standalone"`, `galaxy.json` build/start commands, and `/api/health` as the health path.

- [ ] **Step 1: Write the failing deployment configuration test**

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("production runtime configuration", () => {
  it("pins development to Node 22 and emits a standalone Galaxy build", async () => {
    const [nodeVersion, nvmrc, packageJson, galaxy] = await Promise.all([
      readFile(".node-version", "utf8"),
      readFile(".nvmrc", "utf8"),
      readFile("package.json", "utf8").then(JSON.parse),
      readFile("galaxy.json", "utf8").then(JSON.parse),
    ]);
    expect(nodeVersion.trim()).toBe("22.23.2");
    expect(nvmrc.trim()).toBe("22.23.2");
    expect(packageJson.engines.node).toBe(">=22 <23");
    expect(nextConfig.output).toBe("standalone");
    expect(galaxy).toMatchObject({
      commands: { install: "npm ci", build: "npm run build", start: "npm start" },
      health: { path: "/api/health" },
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/deployment/runtime-config.test.ts`

Expected: FAIL because the pinned version is 26.8.1, standalone output is absent, and `galaxy.json` does not exist.

- [ ] **Step 3: Apply the Node and deployment configuration**

Set both version files to `22.23.2`, set `engines.node` to `>=22 <23`, align `@types/node` to the current Node 22 release, and add:

```ts
const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.15.4"],
};
```

Create `galaxy.json`:

```json
{
  "commands": {
    "install": "npm ci",
    "build": "npm run build",
    "start": "npm start"
  },
  "health": { "path": "/api/health" },
  "deploy": { "rootDirectory": "./" }
}
```

Create `.galaxyignore` with `.git/`, `.next/`, `node_modules/`, `.data/`, `.env*`, `coverage/`, `.worktrees/`, `docs/`, and `*.log`, while retaining source, migrations, package manifests, and public assets.

- [ ] **Step 4: Install and validate under Node 22**

Run:

```bash
fnm install 22.23.2
fnm use 22.23.2
npm install
npm test -- tests/deployment/runtime-config.test.ts
npm run typecheck
npm run build
```

Expected: the focused test, typecheck, and build all pass on Node 22.23.2.

- [ ] **Step 5: Commit the runtime boundary**

```bash
git add .node-version .nvmrc package.json package-lock.json next.config.ts galaxy.json .galaxyignore tests/deployment/runtime-config.test.ts
git commit -m "chore: standardize Node 22 Galaxy runtime"
```

---

### Task 2: Add healthy request pacing and Retry-After support

**Files:**
- Create: `src/server/http/request-governor.ts`
- Modify: `src/server/http/retrying-fetch.ts`
- Modify: `src/integrations/camara/client.ts`
- Modify: `src/integrations/senado/client.ts`
- Test: `tests/server/http/request-governor.test.ts`
- Test: `tests/server/http/retrying-fetch.test.ts`

**Interfaces:**
- Consumes: `RetryingRequestInit` and each adapter's injected `Fetcher`.
- Produces: `RequestGovernor.waitTurn(signal?: AbortSignal): Promise<void>` and `createGovernedFetcher(options): Fetcher`.

- [ ] **Step 1: Write failing governor tests**

```ts
it("serializes starts at the configured minimum interval", async () => {
  const starts: number[] = [];
  let now = 0;
  const governor = new RequestGovernor({
    minimumIntervalMs: 3_000,
    now: () => now,
    sleep: async (ms) => { now += ms; },
  });
  await governor.waitTurn(); starts.push(now);
  await governor.waitTurn(); starts.push(now);
  await governor.waitTurn(); starts.push(now);
  expect(starts).toEqual([0, 3_000, 6_000]);
});

it("does not create a catch-up burst after a slow request", async () => {
  let now = 0;
  const governor = new RequestGovernor({
    minimumIntervalMs: 3_000,
    now: () => now,
    sleep: async (ms) => { now += ms; },
  });
  await governor.waitTurn();
  now = 10_000;
  await governor.waitTurn();
  expect(now).toBe(10_000);
  await governor.waitTurn();
  expect(now).toBe(13_000);
});
```

Add a retry test where the first response is `429` with `Retry-After: 7` and assert the injected sleeper receives `7_000` rather than the shorter exponential delay.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/server/http/request-governor.test.ts tests/server/http/retrying-fetch.test.ts`

Expected: FAIL because the governor and Retry-After behavior do not exist.

- [ ] **Step 3: Implement the governor**

```ts
export interface RequestGovernorOptions {
  minimumIntervalMs: number;
  now?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export class RequestGovernor {
  constructor(options: RequestGovernorOptions);
  waitTurn(signal?: AbortSignal): Promise<void>;
}

export function createGovernedFetcher(options: {
  minimumIntervalMs: number;
  retryPolicy?: RetryPolicy;
}): (url: URL, init?: RetryingRequestInit) => Promise<Response>;
```

Use a promise tail so concurrent calls queue deterministically. Schedule the next permissible start from the actual start time, not from the previous target time.

Extend retry dependencies without leaking them into normal callers:

```ts
export interface RetryingRequestInit extends RequestInit {
  retry?: RetryPolicy;
  beforeAttempt?: (signal?: AbortSignal) => Promise<void>;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}
```

Parse `Retry-After` as either delta seconds or an HTTP date. Use `max(retryAfter, exponentialBackoffWithJitter)`, cap exponential delay, and preserve cancellation behavior.

- [ ] **Step 4: Make official adapters use independent source governors**

Create one default governed fetcher per adapter instance with `minimumIntervalMs: 3_000`. Preserve injected test fetchers unchanged so fixtures stay fast. The Câmara archive fetcher and API fetcher share the Câmara governor.

- [ ] **Step 5: Run HTTP and integration tests**

Run:

```bash
npm test -- tests/server/http/request-governor.test.ts tests/server/http/retrying-fetch.test.ts tests/integrations/camara/client.test.ts tests/integrations/senado/client.test.ts
```

Expected: PASS, including cancellation and streaming-body regressions.

- [ ] **Step 6: Commit request health controls**

```bash
git add src/server/http/request-governor.ts src/server/http/retrying-fetch.ts src/integrations/camara/client.ts src/integrations/senado/client.ts tests/server/http/request-governor.test.ts tests/server/http/retrying-fetch.test.ts
git commit -m "feat: pace official source requests"
```

---

### Task 3: Persist collection tasks, leases, progress, and failures

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/historical/task-repository.ts`
- Create: `src/domain/historical-collection.ts`
- Create: migration generated under `drizzle/`
- Modify: `drizzle/meta/_journal.json`
- Create: generated snapshot under `drizzle/meta/`
- Test: `tests/server/historical/task-repository.test.ts`
- Test: `tests/server/db/migration-historical-collector.test.ts`

**Interfaces:**
- Produces: `HistoricalPhase`, `HistoricalTask`, and `HistoricalTaskRepository` methods used by the collector engine.

Define:

```ts
export const HISTORICAL_PHASES = [
  "catalog",
  "authors_topics",
  "movements",
  "vote_events",
  "individual_votes",
  "reconcile",
  "validate",
] as const;
export type HistoricalPhase = typeof HISTORICAL_PHASES[number];

export interface HistoricalTask {
  id: string;
  source: "camara" | "senado";
  year: number;
  phase: HistoricalPhase;
  cursor: string | null;
  status: "pending" | "running" | "waiting" | "complete" | "failed";
  attempts: number;
  recordsRead: number;
  recordsPersisted: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date | null;
  lastErrorCode: string | null;
}
```

- [ ] **Step 1: Write failing repository tests**

Cover these exact behaviors:

```ts
it("seeds every phase from the newest year to 1946 without duplicates", async () => {
  await repository.seedRange({ fromYear: 1946, throughYear: 1947, sources: ["camara", "senado"] });
  await repository.seedRange({ fromYear: 1946, throughYear: 1947, sources: ["camara", "senado"] });
  const tasks = await repository.listStatus();
  expect(tasks).toHaveLength(2 * 2 * HISTORICAL_PHASES.length);
});

it("reserves only an eligible phase and recovers an expired lease", async () => {
  const first = await repository.reserveNext("worker-a", now, 60_000);
  expect(first).toMatchObject({ year: 1947, phase: "catalog", leaseOwner: "worker-a" });
  expect(await repository.reserveNext("worker-b", now, 60_000)).toBeNull();
  expect(await repository.reserveNext("worker-b", new Date(now.getTime() + 60_001), 60_000))
    .toMatchObject({ id: first!.id, leaseOwner: "worker-b" });
});

it("commits cursor, counters and persisted entities atomically", async () => {
  await expect(repository.commitBatch(task, update, async (tx) => {
    await tx.insert(bills).values(invalidFixture);
  })).rejects.toThrow();
  expect(await repository.get(task.id)).toMatchObject({ cursor: null, recordsPersisted: 0 });
});
```

- [ ] **Step 2: Run tests and verify schema failures**

Run: `npm test -- tests/server/historical/task-repository.test.ts tests/server/db/migration-historical-collector.test.ts`

Expected: FAIL because the tables and repository are absent.

- [ ] **Step 3: Add queue schema**

Create `historical_collection_status`, `historical_collection_phase`, `historical_collection_tasks`, and `historical_collection_runs`. Use a unique index on `(source, year, phase)` and indexes on `(status, next_attempt_at, year)` and `(lease_expires_at)`.

The task repository must expose:

```ts
seedRange(input: { fromYear: number; throughYear: number; sources: LegislativeSourceName[] }): Promise<number>;
reserveNext(workerId: string, now: Date, leaseMs: number): Promise<HistoricalTask | null>;
heartbeat(taskId: string, workerId: string, leaseExpiresAt: Date): Promise<boolean>;
commitBatch<T>(task: HistoricalTask, update: HistoricalBatchUpdate, work: (tx: DatabaseTransaction) => Promise<T>): Promise<T>;
complete(taskId: string, workerId: string, completedAt: Date): Promise<void>;
wait(taskId: string, workerId: string, nextAttemptAt: Date, errorCode: string): Promise<void>;
fail(taskId: string, workerId: string, errorCode: string, failedAt: Date): Promise<void>;
listStatus(): Promise<HistoricalTask[]>;
```

Reservation must use `FOR UPDATE SKIP LOCKED`. A non-catalog phase is eligible only when the previous phase for the same source/year is complete. Prefer higher years, then the declared phase order, then oldest update time.

- [ ] **Step 4: Generate and inspect the additive migration**

Run: `npm run db:generate`

Expected: one new additive migration and snapshot; no destructive changes to existing application tables.

- [ ] **Step 5: Run migration and repository tests**

Run: `npm test -- tests/server/historical/task-repository.test.ts tests/server/db/migration-historical-collector.test.ts`

Expected: PASS, including idempotent seeding and expired lease recovery.

- [ ] **Step 6: Commit queue persistence**

```bash
git add src/domain/historical-collection.ts src/server/db/schema.ts src/server/historical/task-repository.ts drizzle tests/server/historical tests/server/db/migration-historical-collector.test.ts
git commit -m "feat: persist historical collection queue"
```

---

### Task 4: Implement the collector engine and command-line contract

**Files:**
- Create: `src/jobs/historical-collector.ts`
- Create: `src/jobs/historical-task-executor.ts`
- Create: `scripts/collect-history.ts`
- Create: `scripts/collect-status.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/jobs/historical-collector.test.ts`
- Test: `tests/jobs/historical-task-executor.test.ts`

**Interfaces:**
- Consumes: `HistoricalTaskRepository` and a `HistoricalTaskExecutor`.
- Produces: `runHistoricalCollector(dependencies, options): Promise<HistoricalCollectorReport>` and npm commands `collect:history` and `collect:status`.

```ts
export interface HistoricalCollectorOptions {
  fromYear: number;
  throughYear: number;
  sources: LegislativeSourceName[];
  workerId: string;
  leaseMs: number;
  once: boolean;
  signal?: AbortSignal;
}

export interface HistoricalTaskExecutor {
  execute(task: HistoricalTask, signal?: AbortSignal): Promise<
    | HistoricalProgressBatch
    | HistoricalCompleteBatch
  >;
}

export interface HistoricalProgressBatch {
  outcome: "progress";
  cursor: string;
  read: number;
  persisted: number;
  persist(tx: DatabaseTransaction): Promise<void>;
}

export interface HistoricalCompleteBatch {
  outcome: "complete";
  read: number;
  persisted: number;
  persist(tx: DatabaseTransaction): Promise<void>;
}
```

- [ ] **Step 1: Write failing engine tests**

```ts
it("resumes after a committed cursor and exits cleanly on abort", async () => {
  executor.execute
    .mockResolvedValueOnce({ outcome: "progress", cursor: "bill-100", read: 1, persisted: 1, persist })
    .mockImplementationOnce(async () => {
      controller.abort();
      return { outcome: "progress", cursor: "bill-101", read: 1, persisted: 1, persist };
    });
  const report = await runHistoricalCollector(dependencies, { ...options, signal: controller.signal });
  expect(repository.commitBatch).toHaveBeenNthCalledWith(
    1,
    expect.anything(),
    expect.objectContaining({ cursor: "bill-100", recordsRead: 1, recordsPersisted: 1 }),
    persist,
  );
  expect(report.reason).toBe("aborted");
});

it("waits temporary failures and leaves permanent failures inspectable", async () => {
  executor.execute.mockRejectedValueOnce(new OfficialSourceError("busy", url, 429, true));
  await runHistoricalCollector(dependencies, options);
  expect(repository.wait).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.any(Date), "SOURCE_RATE_LIMITED");
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/jobs/historical-collector.test.ts tests/jobs/historical-task-executor.test.ts`

Expected: FAIL because the engine and CLI parsing do not exist.

- [ ] **Step 3: Implement the reserve/execute/commit loop**

Seed the range, reserve one task, heartbeat before long calls, execute one bounded unit, and pass the returned `persist` callback to `commitBatch` so entity writes and checkpoint advancement share one database transaction. Stop on `SIGINT` or `SIGTERM` after the in-flight commit. Temporary errors transition to `waiting`; contract errors transition to `failed`; both use sanitized `sourceErrorCode` values.

- [ ] **Step 4: Implement strict argument parsing**

Accept only:

```text
--from=1946..currentYear
--through=1946..currentYear
--source=camara|senado|all
--requests-per-minute=1..20
--once
```

Default to `--from=1946`, current year, both sources, and 20 requests per minute. Reject unknown arguments and `from > through` before importing application modules.

Add scripts:

```json
{
  "collect:history": "node scripts/collect-history.ts",
  "collect:status": "node scripts/collect-status.ts"
}
```

Both scripts load `.env.production.local` first when present, then `.env`, and print sanitized JSON lines only.

- [ ] **Step 5: Run collector tests**

Run: `npm test -- tests/jobs/historical-collector.test.ts tests/jobs/historical-task-executor.test.ts`

Expected: PASS for progress, abort, temporary wait, permanent failure, and argument validation.

- [ ] **Step 6: Commit the engine**

```bash
git add src/jobs/historical-collector.ts src/jobs/historical-task-executor.ts scripts/collect-history.ts scripts/collect-status.ts package.json package-lock.json tests/jobs/historical-collector.test.ts tests/jobs/historical-task-executor.test.ts
git commit -m "feat: add resumable historical collector"
```

---

### Task 5: Execute catalog, authors/topics, and movement phases

**Files:**
- Modify: `src/jobs/backfill-legislative.ts`
- Modify: `src/jobs/historical-task-executor.ts`
- Modify: `src/server/db/repositories.ts`
- Create: `src/server/historical/bill-reader.ts`
- Test: `tests/jobs/historical-task-executor.test.ts`
- Test: `tests/server/historical/bill-reader.test.ts`

**Interfaces:**
- Produces: `collectCatalogPage`, `listCollectionBills`, and phase executors for `catalog`, `authors_topics`, and `movements`.

```ts
export interface CollectionBill {
  bill: Bill;
  cursor: string;
}

export function listCollectionBills(input: {
  source: LegislativeSourceName;
  year: number;
  after: string | null;
  limit: number;
}): Promise<CollectionBill[]>;
```

- [ ] **Step 1: Write failing phase tests**

Prove newest-year task selection, one bounded page per execution, cursor advancement only after persistence, and reuse of an existing catalog row without duplication.

```ts
it("persists authors and topics in the same commit that advances the bill cursor", async () => {
  adapter.listBillAuthors.mockResolvedValue([author]);
  adapter.listBillTopics.mockResolvedValue([topic]);
  const result = await executor.execute(task({ phase: "authors_topics", cursor: null }));
  await result.persist(transaction);
  expect(repository.upsertBillGraph).toHaveBeenCalledWith(transaction, {
    bill, authors: [author], topics: [topic], movements: [], voteEvents: [], individualVotes: [],
  });
  expect(result).toMatchObject({ outcome: "progress", cursor: bill.externalId, read: 1, persisted: 2 });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/jobs/historical-task-executor.test.ts tests/server/historical/bill-reader.test.ts`

Expected: FAIL for absent phase implementations.

- [ ] **Step 3: Extract single-year catalog import**

Refactor the existing backfill internals into an exported bounded function without changing `backfillLegislative` behavior. Câmara continues to prefer annual archives; Senado continues to page monthly. For an API page, persist one page and its next-page cursor per task execution. For a bulk archive, stream one bounded batch, store the last external identifier as cursor, and on resume re-open the archive and skip deterministically through that identifier before reading the next batch. This trades some repeated archive reads for durable progress without holding a year-sized transaction.

- [ ] **Step 4: Implement deterministic bill iteration**

Read bills by source and `proposalYear`, ordered by `externalId`, with an exclusive cursor. Convert stored rows back to the `Bill` domain contract without changing official text.

- [ ] **Step 5: Implement authors/topics and movements**

For each reserved task, process one bill, invoke only the resource methods for that phase, and call `upsertBillGraph` with empty arrays for unrelated collections. A source `404` for a malformed historical record becomes a permanent sanitized task failure; empty official collections are valid progress.

- [ ] **Step 6: Run focused and legacy backfill tests**

Run:

```bash
npm test -- tests/jobs/historical-task-executor.test.ts tests/server/historical/bill-reader.test.ts tests/jobs/backfill-legislative.test.ts tests/integrations/camara/bootstrap.test.ts tests/integrations/senado/client.test.ts
```

Expected: PASS with unchanged legacy backfill reports.

- [ ] **Step 7: Commit catalog/detail phases**

```bash
git add src/jobs/backfill-legislative.ts src/jobs/historical-task-executor.ts src/server/db/repositories.ts src/server/historical/bill-reader.ts tests/jobs/historical-task-executor.test.ts tests/server/historical/bill-reader.test.ts
git commit -m "feat: collect historical bill details"
```

---

### Task 6: Execute vote events, individual votes, reconciliation, and validation

**Files:**
- Modify: `src/jobs/historical-task-executor.ts`
- Modify: `src/server/db/repositories.ts`
- Modify: `src/server/legislative/persist-bill-graph.ts`
- Modify: `src/server/legislative/reconcile-bicameral.ts`
- Test: `tests/jobs/historical-task-executor.test.ts`
- Test: `tests/jobs/backfill-camara-votes.test.ts`
- Test: `tests/server/legislative/reconcile-bicameral.test.ts`

**Interfaces:**
- Produces: phase executors for `vote_events`, `individual_votes`, `reconcile`, and `validate` plus `ensureReferencedLawmakers` shared by request hydration and background collection.

- [ ] **Step 1: Write failing vote and validation tests**

```ts
it("stores empty non-secret individual vote collections as completed progress", async () => {
  adapter.listIndividualVotes.mockResolvedValue([]);
  const result = await executor.execute(task({ phase: "individual_votes" }));
  expect(result).toMatchObject({ outcome: "progress", read: 1, persisted: 0 });
});

it("never requests individual votes for a secret event", async () => {
  repository.listVoteEventsForCollection.mockResolvedValue([secretVote]);
  await executor.execute(task({ phase: "individual_votes" }));
  expect(adapter.listIndividualVotes).not.toHaveBeenCalled();
});

it("fails validation when required catalog rows are orphaned", async () => {
  repository.validateYear.mockResolvedValue({ valid: false, code: "ORPHAN_BILL_AUTHOR" });
  await expect(executor.execute(task({ phase: "validate" }))).rejects.toMatchObject({ code: "ORPHAN_BILL_AUTHOR" });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/jobs/historical-task-executor.test.ts tests/jobs/backfill-camara-votes.test.ts tests/server/legislative/reconcile-bicameral.test.ts`

Expected: FAIL for missing phase behavior.

- [ ] **Step 3: Implement vote phases**

`vote_events` loads and upserts the official events for one bill. `individual_votes` iterates the stored public events for one bill, queries them through the governed adapter, ensures referenced lawmakers exist, and then upserts votes. Secret events are skipped without inference. Câmara annual vote archives remain supported as an optimization after matching vote events exist.

- [ ] **Step 4: Extract lawmaker completion**

Move the existing missing-lawmaker logic into:

```ts
export async function ensureReferencedLawmakers(
  adapter: LegislativeSourceAdapter,
  repository: BillGraphRepository,
  externalIds: readonly string[],
): Promise<void>;
```

Keep batches bounded; the source governor serializes actual request starts.

- [ ] **Step 5: Implement reconciliation and validation**

Reconcile only the selected source/year and official identity keys. Validate counts, foreign keys, duplicate external identifiers, invalid years, and tasks left with nonterminal predecessors. Return a stable code rather than raw SQL.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- tests/jobs/historical-task-executor.test.ts tests/jobs/backfill-camara-votes.test.ts tests/server/legislative/reconcile-bicameral.test.ts tests/server/legislative/hydrate-project.test.ts
```

Expected: PASS and no regression in on-demand hydration.

- [ ] **Step 7: Commit completion phases**

```bash
git add src/jobs/historical-task-executor.ts src/server/db/repositories.ts src/server/legislative/persist-bill-graph.ts src/server/legislative/reconcile-bicameral.ts tests/jobs/historical-task-executor.test.ts tests/jobs/backfill-camara-votes.test.ts tests/server/legislative/reconcile-bicameral.test.ts
git commit -m "feat: collect historical votes safely"
```

---

### Task 7: Add status reporting and database capacity safeguards

**Files:**
- Create: `src/jobs/historical-status.ts`
- Modify: `scripts/collect-status.ts`
- Modify: `src/jobs/historical-collector.ts`
- Test: `tests/jobs/historical-status.test.ts`

**Interfaces:**
- Produces: `readHistoricalStatus(database, capacityBytes): Promise<HistoricalStatusReport>`.

```ts
export interface HistoricalStatusReport {
  storage: { usedBytes: string; capacityBytes: string; percent: number; level: "ok" | "warning" | "critical" | "stop" };
  tasks: Record<HistoricalTask["status"], number>;
  completedYears: Partial<Record<LegislativeSourceName, number[]>>;
  current: Array<Pick<HistoricalTask, "source" | "year" | "phase" | "cursor" | "recordsPersisted">>;
  failures: Array<Pick<HistoricalTask, "source" | "year" | "phase" | "lastErrorCode">>;
}
```

- [ ] **Step 1: Write failing threshold tests**

```ts
expect(classifyStorage(69)).toBe("ok");
expect(classifyStorage(70)).toBe("warning");
expect(classifyStorage(80)).toBe("critical");
expect(classifyStorage(90)).toBe("stop");
```

Also assert output omits `DATABASE_URL`, task lease-owner internals, and upstream URLs.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- tests/jobs/historical-status.test.ts`

Expected: FAIL because reporting does not exist.

- [ ] **Step 3: Implement database size checks and safe status JSON**

Read `pg_database_size(current_database())`. Stop reserving new work at 90% of the configured 30 GB capacity, but permit `collect:status` and clean shutdown. Emit warning records at 70% and critical records at 80%.

- [ ] **Step 4: Run status tests**

Run: `npm test -- tests/jobs/historical-status.test.ts tests/jobs/historical-collector.test.ts`

Expected: PASS for thresholds and sanitized output.

- [ ] **Step 5: Commit observability**

```bash
git add src/jobs/historical-status.ts src/jobs/historical-collector.ts scripts/collect-status.ts tests/jobs/historical-status.test.ts
git commit -m "feat: report historical collection health"
```

---

### Task 8: Persist candidate photos in PostgreSQL

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/electoral/database-media-store.ts`
- Modify: `scripts/sync-election.ts`
- Modify: `src/server/candidates/queries.ts`
- Modify: `app/api/candidates/media/[...segments]/route.ts`
- Create: migration generated under `drizzle/`
- Modify: generated Drizzle metadata
- Test: `tests/server/electoral/database-media-store.test.ts`
- Modify: `tests/server/candidates/media-route.test.ts`
- Modify: `tests/jobs/sync-election.test.ts`

**Interfaces:**
- Consumes: the existing `ElectionMediaStore` lifecycle.
- Produces: `DatabaseElectoralMediaStore` and `CandidateMediaAsset.content` for JPEG responses.

Define a custom PostgreSQL `bytea` column and table:

```ts
export const electoralMediaBlobs = pgTable("electoral_media_blobs", {
  storageKey: text("storage_key").primaryKey(),
  syncRunId: text("sync_run_id").notNull(),
  kind: text("kind").notNull(),
  mimeType: text("mime_type").notNull(),
  byteLength: integer("byte_length").notNull(),
  sha256: text("sha256").notNull(),
  content: bytea("content").notNull(),
  published: boolean("published").default(false).notNull(),
  ...timestamps,
});
```

- [ ] **Step 1: Write failing atomic-publication tests**

Verify that staging a JPEG stores an unpublished blob, `publish(runId)` exposes it, `discard(runId)` removes it, duplicate keys fail, invalid formats fail, and `removePublished(previousRunId)` cannot remove the current generation.

- [ ] **Step 2: Write the failing route test**

Replace filesystem setup with an inserted JPEG blob and assert:

```ts
const response = await call(handler, ["candidate", "2026", candidateId, "photo"]);
expect(response.status).toBe(200);
expect(response.headers.get("content-type")).toBe("image/jpeg");
expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpegBytes);
```

Assert government plans and certificates use their official URLs and are not served from the blob table.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -- tests/server/electoral/database-media-store.test.ts tests/server/candidates/media-route.test.ts tests/jobs/sync-election.test.ts`

Expected: FAIL because media is filesystem-backed.

- [ ] **Step 4: Implement the database media store**

Implement the existing lifecycle with buffered per-entry content bounded by a strict maximum JPEG size. Consume PDF streams without storing them and return `null` storage keys so snapshot rows retain their official URLs. Update the election media port to allow `Promise<string | null>` and require a key only for photos.

- [ ] **Step 5: Serve allowlisted published JPEG bytes**

Change `CandidateMediaAsset` to:

```ts
export interface CandidateMediaAsset {
  content: Uint8Array;
  mimeType: "image/jpeg";
  originalFilename: string;
}
```

Resolve only the current successful snapshot joined to a published blob. Preserve `nosniff`, caching, sanitized 404, and sanitized 500 behavior.

- [ ] **Step 6: Generate and inspect the additive migration**

Run: `npm run db:generate`

Expected: a table/index migration only; no destructive changes to candidate tables.

- [ ] **Step 7: Run media and election tests**

Run:

```bash
npm test -- tests/server/electoral/database-media-store.test.ts tests/server/candidates/media-route.test.ts tests/jobs/sync-election.test.ts tests/integrations/tse/media-store.test.ts
```

Expected: database-backed production behavior passes while the filesystem store's unit tests remain valid as a local adapter.

- [ ] **Step 8: Commit durable media**

```bash
git add src/server/db/schema.ts src/server/electoral/database-media-store.ts scripts/sync-election.ts src/server/candidates/queries.ts 'app/api/candidates/media/[...segments]/route.ts' drizzle tests/server/electoral tests/server/candidates/media-route.test.ts tests/jobs/sync-election.test.ts
git commit -m "feat: persist candidate photos in PostgreSQL"
```

---

### Task 9: Document and test production database bootstrap

**Files:**
- Create: `scripts/bootstrap-production-database.sql`
- Create: `scripts/verify-production-database.ts`
- Create: `docs/operations/galaxy-production.md`
- Modify: `.gitignore`
- Test: `tests/deployment/production-assets.test.ts`

**Interfaces:**
- Produces: a parameterized SQL bootstrap, a secret-safe database verification command, and an operator runbook.

- [ ] **Step 1: Write failing artifact safety tests**

```ts
it("keeps production secrets local and admin credentials out of app config", async () => {
  const gitignore = await readFile(".gitignore", "utf8");
  const runbook = await readFile("docs/operations/galaxy-production.md", "utf8");
  expect(gitignore).toContain(".env.production.local");
  expect(runbook).not.toMatch(/postgres:\/\/[^\s<]+:[^\s<]+@/);
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- tests/deployment/production-assets.test.ts`

Expected: FAIL because the artifacts are absent.

- [ ] **Step 3: Add bootstrap SQL without embedded credentials**

Use psql variables and fail closed:

```sql
\set ON_ERROR_STOP on
CREATE ROLE :"app_role" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE DATABASE :"app_database" OWNER :"app_role";
REVOKE ALL ON DATABASE :"app_database" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"app_database" TO :"app_role";
```

The runbook must generate a random password locally, invoke this file as the Galaxy admin, store only the application connection string in `.env.production.local` and Galaxy variables, run migrations as the application owner, and remove shell variables afterward.

- [ ] **Step 4: Document exact Galaxy settings**

Record Node 22, Production, one container, `npm ci`, `npm run build`, `npm start`, `/api/health`, `NODE_ENV=production`, `GEO_PROVIDER=none`, `LEGISLATIVE_HISTORY_START_YEAR=1946`, source URLs, timeout/retry values, and which optional AI/VAPID variables may be omitted.

Add `scripts/verify-production-database.ts`. It must connect through `DATABASE_URL`, query `current_database()`, `current_user`, `pg_roles.rolsuper`, the Drizzle migration count, required tables, and `pg_database_size`, then print only names, counts, byte totals, and booleans. It must never print the connection string or environment values.

- [ ] **Step 5: Run artifact tests and shell parse check**

Run:

```bash
npm test -- tests/deployment/production-assets.test.ts
```

Then validate the bootstrap script against a disposable PostgreSQL container: create a temporary server, run the script once with test-only variables, inspect the resulting owner/privileges, and remove the container. Expected: the Vitest test and disposable-database assertions pass and no real secret is printed or committed.

- [ ] **Step 6: Commit deployment operations**

```bash
git add .gitignore scripts/bootstrap-production-database.sql scripts/verify-production-database.ts docs/operations/galaxy-production.md tests/deployment/production-assets.test.ts
git commit -m "docs: add Galaxy production bootstrap"
```

---

### Task 10: Run the full local release gate on Node 22

**Files:**
- Modify only files required by failures attributable to this implementation.
- Create: `docs/validation/2026-09-09-galaxy-production-readiness.md`

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: a release candidate and evidence report.

- [ ] **Step 1: Run all automated checks under the pinned runtime**

Run:

```bash
fnm use 22.23.2
node --version
npm --version
npm test
npm run typecheck
npm run build
```

Expected: Node reports `v22.23.2`; all tests, typecheck, and build pass.

- [ ] **Step 2: Test standalone startup and health**

Run the production server with an unused `PORT`, query `/api/health`, `/`, `/candidatos`, and a project detail page, then terminate gracefully. Expect valid HTTP responses and no secret-bearing logs.

- [ ] **Step 3: Exercise resumability against the local test database**

Run one collector unit with `--once`, record status, interrupt a multi-unit run, restart it, and confirm the committed cursor increases without duplicate external IDs.

- [ ] **Step 4: Record release evidence**

Write exact commands, timestamps, versions, test totals, build result, collector checkpoints, and known operational limitations to the validation document. Do not include environment values.

- [ ] **Step 5: Commit the readiness report**

```bash
git add docs/validation/2026-09-09-galaxy-production-readiness.md
git commit -m "docs: validate Galaxy production readiness"
```

---

### Task 11: Provision Galaxy PostgreSQL and migrate production

**Files:**
- Create locally but never commit: `.env.production.local`
- Update: Galaxy database roles and logical database

**Interfaces:**
- Consumes: the bootstrap SQL, Galaxy admin connection, and validated Drizzle migrations.
- Produces: the `pulse` logical database and `pulse_app` connection URL.

- [ ] **Step 1: Read the masked Galaxy connection details**

Use the authenticated Galaxy database page. Reveal/copy the admin credential only into a temporary local environment variable; never print it or save it in shell history.

- [ ] **Step 2: Inspect before mutating**

Connect with TLS and list databases/roles by name. If `pulse` or `pulse_app` already exists, inspect ownership and privileges and adapt without deleting data.

- [ ] **Step 3: Bootstrap the logical database and application role**

Generate a random application password locally and run `scripts/bootstrap-production-database.sql` through psql variables. This step is idempotent at the operator level: existing compatible objects are reused; incompatible existing objects stop the run for review.

- [ ] **Step 4: Save only the application URL locally**

Write `.env.production.local` with `DATABASE_URL`, official source URLs, `LEGISLATIVE_HISTORY_START_YEAR=1946`, `ELECTION_YEAR=2026`, `GEO_PROVIDER=none`, and optional existing AI/VAPID values. Set file mode `0600`.

- [ ] **Step 5: Apply migrations and verify privileges**

Run:

```bash
node --env-file=.env.production.local ./node_modules/drizzle-kit/bin.cjs migrate
node --env-file=.env.production.local scripts/verify-production-database.ts
```

Use Node 22's built-in environment-file loader rather than sourcing the file. Expected: migrations complete as `pulse_app`; the verification script prints only database/user names, migration counts, and booleans; no superuser privilege or connection string is printed.

- [ ] **Step 6: Verify the empty production schema**

Check required tables, foreign keys, indexes, queue enums, and `pg_database_size`. Do not start historical collection yet.

---

### Task 12: Create and deploy the Galaxy Web App

**Files:**
- Create locally but never commit: `.galaxy/config.json`
- Update: Galaxy Web App configuration and protected variables

**Interfaces:**
- Consumes: the release candidate, `galaxy.json`, and production application URL.
- Produces: a live Galaxy application connected as `pulse_app`.

- [ ] **Step 1: Authenticate the Galaxy CLI and confirm account**

Run `npx @galaxy-cloud/cli@1.0.6 login` and `npx @galaxy-cloud/cli@1.0.6 whoami`. Confirm the owner is `italojsmeteor` before continuing.

- [ ] **Step 2: Inspect the exact paid resource before initialization**

Use the authenticated Galaxy UI to select Next.js/Node 22, `us-east-1`, Production, one smallest viable container, and the build/start commands from `galaxy.json`, but do not submit creation. Record the exact hourly and estimated monthly charge displayed for that configuration.

- [ ] **Step 3: Obtain action-time confirmation for billing**

Show the exact hourly and estimated monthly price displayed by Galaxy. Do not run `galaxy init` or submit app creation until the user confirms that specific recurring charge.

- [ ] **Step 4: Create the app and stage protected variables**

After confirmation, run `npx @galaxy-cloud/cli@1.0.6 init` with the already-inspected configuration and create the app. Import only the production application environment, verify values are masked, and set `NODE_ENV=production`. Do not upload the Galaxy admin credential.

- [ ] **Step 5: Deploy and follow logs to completion**

Run `galaxy deploy`. Verify build success, container health, and the final Galaxy URL. On failure, inspect build/deploy logs, fix locally with a failing regression test when code is involved, and redeploy.

- [ ] **Step 6: Validate the live application manually**

Open the live URL and verify home feed, advanced project filters, project timeline/votes, candidate catalog/filter/profile/photo, account creation/login, follow redirect, and `/api/health`. Use official source links for sample comparison.

- [ ] **Step 7: Record deploy evidence without secrets**

Append app URL, deployment identifier, health result, Node major version, database name, and manual validation outcomes to the readiness report, then commit the report update.

---

### Task 13: Start the slow production population

**Files:**
- Modify: `docs/validation/2026-09-09-galaxy-production-readiness.md`

**Interfaces:**
- Consumes: `.env.production.local`, the migrated Galaxy database, and the live app.
- Produces: a running local collector with durable Galaxy checkpoints.

- [ ] **Step 1: Synchronize the current legislative window**

Run `npm run sync` against production, verify Câmara and Senado source health rows, and confirm the app feed receives official records.

- [ ] **Step 2: Synchronize the 2026 electoral snapshot**

Run `npm run sync:election` against production. Verify candidate counts, JPEG blob count/size, current snapshot publication, and live candidate photos.

- [ ] **Step 3: Run one historical unit**

Run `npm run collect:history -- --from=1946 --through=<current-year> --source=all --requests-per-minute=20 --once`. Verify it chooses the current year and commits a cursor.

- [ ] **Step 4: Validate official-source parity**

Compare at least one Câmara and one Senado project, one event of voting, and one published individual vote against their official URLs. Record identifiers and outcomes, not copied payloads.

- [ ] **Step 5: Start the long-running collector**

Run the same collector without `--once` in a persistent local terminal session. Verify status after at least two committed units and prove that restarting resumes rather than reseeds duplicates.

- [ ] **Step 6: Complete final release verification**

Run `npm run collect:status`, query the live health endpoint, and update the readiness report with the initial queue and storage state. Commit only the sanitized report; keep the collector running.
