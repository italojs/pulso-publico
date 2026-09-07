# Histórico legislativo desde 2019 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar o catálogo legislativo federal desde 2019 e carregar, reconciliar e armazenar o histórico detalhado de cada matéria quando sua página for aberta.

**Architecture:** O backfill de catálogo será um processo retomável e independente do sincronismo incremental, com checkpoints anuais por fonte. A página pública chamará um único serviço de hidratação, protegido por advisory lock, que atualiza o projeto solicitado, descobre um parceiro bicameral por identidade oficial exata e hidrata esse parceiro antes da leitura pública.

**Tech Stack:** Node.js 26.8.1, TypeScript 7, Next.js 16 App Router, PostgreSQL, Drizzle ORM, Vitest 5, APIs oficiais da Câmara e do Senado.

**Spec:** `docs/superpowers/specs/2026-09-06-historico-legislativo-desde-2019-design.md`

## Global Constraints

- Usar `LEGISLATIVE_HISTORY_START_YEAR=2019`; aceitar valores de 1946 até o ano corrente.
- Não apagar proposições, históricos, usuários, acompanhamentos ou resumos existentes.
- Não usar IA para importar fatos ou descobrir relações legislativas.
- Só vincular matérias por fonte diferente, tipo, número e ano oficiais e sinal oficial de tramitação entre Casas.
- Manter Câmara e Senado visualmente separados na leitura pública.
- Preservar a alteração local pré-existente em `tests/server/public/queries.test.ts` fora dos commits desta implementação.

---

### Task 1: Configuração fixa e estado persistente

**Files:**
- Modify: `src/server/config.ts`
- Modify: `src/server/db/schema.ts`
- Create: `drizzle/0011_legislative_history.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `tests/server/db/migration-legislative-history.test.ts`
- Modify: `tests/server/config.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `env.LEGISLATIVE_HISTORY_START_YEAR: number`.
- Produces: tables `historical_import_checkpoints` and `bill_hydration_state`.
- Produces: enum `bill_hydration_status = pending | running | complete | failed`.

- [ ] **Step 1: Write failing configuration tests**

```ts
expect(parseEnv(baseEnv).LEGISLATIVE_HISTORY_START_YEAR).toBe(2019);
expect(() => parseEnv({ ...baseEnv, LEGISLATIVE_HISTORY_START_YEAR: "1945" })).toThrow();
expect(() => parseEnv({ ...baseEnv, LEGISLATIVE_HISTORY_START_YEAR: String(new Date().getUTCFullYear() + 1) })).toThrow();
```

- [ ] **Step 2: Run the focused tests and confirm the old month-based contract fails**

Run: `npm test -- tests/server/config.test.ts tests/server/db/migration-legislative-history.test.ts`

- [ ] **Step 3: Add the additive schema and migration**

Implement unique checkpoint identity `(source, dataset, year)`, hydration identity `bill_id`, indexes for hydration status/retry/recent request, and foreign-key cascade only from hydration state to its bill.

- [ ] **Step 4: Replace `INITIAL_HISTORY_MONTHS` with the fixed-year parser**

```ts
const currentYear = new Date().getUTCFullYear();
LEGISLATIVE_HISTORY_START_YEAR: z.coerce.number().int().min(1946).max(currentYear).default(2019),
```

- [ ] **Step 5: Run the focused tests and generate-check the migration**

Run: `npm test -- tests/server/config.test.ts tests/server/db/migration-legislative-history.test.ts && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add .env.example src/server/config.ts src/server/db/schema.ts drizzle/0011_legislative_history.sql drizzle/meta/_journal.json tests/server/config.test.ts tests/server/db/migration-legislative-history.test.ts
git commit -m "feat: add legislative history state"
```

### Task 2: Repositórios de checkpoint e hidratação

**Files:**
- Modify: `src/server/db/repositories.ts`
- Modify: `tests/server/db/repositories.test.ts`

**Interfaces:**
- Produces: `getHistoricalCheckpoint(source, dataset, year)`.
- Produces: `startHistoricalCheckpoint`, `completeHistoricalCheckpoint`, `failHistoricalCheckpoint`.
- Produces: `getHydrationState`, `markHydrationRunning`, `markHydrationComplete`, `markHydrationFailed`, `touchHydrationRequest`.
- Produces: `findBillByOfficialIdentity(source, proposalType, proposalNumber, proposalYear)` and `getBillIdentity(source, externalId)`.

- [ ] **Step 1: Write integration tests for checkpoint independence and state transitions**

```ts
await repository.startHistoricalCheckpoint("camara", "proposals", 2019, now);
await repository.completeHistoricalCheckpoint("camara", "proposals", 2019, 10, 10, now);
expect(await repository.getCheckpoint("camara")).toBeNull();
expect((await repository.getHistoricalCheckpoint("camara", "proposals", 2019))?.status).toBe("complete");
```

- [ ] **Step 2: Write integration tests for stale-running recovery and exact identity lookup**

Assert that a running state older than the configured timeout is eligible for another attempt and that `PEC 221/2019` never matches `PEC 8/2025`.

- [ ] **Step 3: Run the repository tests and confirm failure**

Run: `npm test -- tests/server/db/repositories.test.ts`

- [ ] **Step 4: Implement the repository methods with conflict-safe upserts**

Use a transaction for state changes and persist only sanitized error codes. Identity lookup must normalize proposal type with the existing `normalizeProposalType` function.

- [ ] **Step 5: Run repository tests**

Run: `npm test -- tests/server/db/repositories.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/server/db/repositories.ts tests/server/db/repositories.test.ts
git commit -m "feat: persist legislative import progress"
```

### Task 3: Catálogo histórico retomável

**Files:**
- Create: `src/jobs/backfill-legislative.ts`
- Create: `scripts/backfill-legislative.ts`
- Create: `tests/jobs/backfill-legislative.test.ts`
- Modify: `src/domain/legislative.ts`
- Modify: `src/integrations/camara/bootstrap.ts`
- Modify: `tests/integrations/camara/bootstrap.test.ts`
- Modify: `src/integrations/senado/client.ts`
- Modify: `tests/integrations/senado/client.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `HistoricalCatalogAdapter.streamCatalogYear(year): AsyncIterable<BillGraph>`.
- Produces: `backfillLegislative(adapters, repository, { fromYear, throughYear, sources, refresh })`.
- Produces CLI: `npm run backfill:legislative -- --from=2019 --source=all`.

- [ ] **Step 1: Write failing orchestration tests**

Test ascending years, skip of completed years, retry of failed/running years, source selection, idempotent upserts, and a sanitized per-year report.

- [ ] **Step 2: Run the orchestration test and confirm failure**

Run: `npm test -- tests/jobs/backfill-legislative.test.ts`

- [ ] **Step 3: Add the yearly catalog interface and Câmara implementation**

Use the official annual proposal archive for the requested year. Emit summary graphs in bounded batches and preserve the existing official identity mapping.

- [ ] **Step 4: Add the Senado implementation with monthly windows bounded to one year**

Use January–December windows, follow official pagination, and ensure every emitted bill has `presentedAt` inside the requested year.

- [ ] **Step 5: Implement the resumable job and CLI parser**

Accepted options are `--from=YYYY`, `--source=camara|senado|all`, and `--refresh`. Reports contain source, year, read, persisted, duration and a limited error code.

- [ ] **Step 6: Run catalog and adapter tests**

Run: `npm test -- tests/jobs/backfill-legislative.test.ts tests/integrations/camara/bootstrap.test.ts tests/integrations/senado/client.test.ts`

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/backfill-legislative.ts src/domain/legislative.ts src/jobs/backfill-legislative.ts src/integrations/camara/bootstrap.ts src/integrations/senado/client.ts tests/jobs/backfill-legislative.test.ts tests/integrations/camara/bootstrap.test.ts tests/integrations/senado/client.test.ts
git commit -m "feat: backfill legislative catalog by year"
```

### Task 4: Serviço único de hidratação sob demanda

**Files:**
- Create: `src/server/legislative/hydrate-project.ts`
- Create: `tests/server/legislative/hydrate-project.test.ts`
- Modify: `src/server/db/advisory-lock.ts`
- Modify: `tests/server/db/advisory-lock.test.ts`
- Modify: `src/jobs/sync-source.ts`

**Interfaces:**
- Produces: `hydrateProject(source, externalId, dependencies, options?): Promise<HydrationResult>`.
- `HydrationResult` is `{ status: "complete" | "cached" | "busy" | "failed"; errorCode?: string }`.
- Consumes: `persistHydratedBillGraph` and hydration repository methods from Tasks 1–2.

- [ ] **Step 1: Write failing unit tests for cached, successful, failed and concurrent hydration**

Assert one upstream graph load for two concurrent requests, persistence before `complete`, stale-running recovery, and preservation of existing graph data after a source failure.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- tests/server/legislative/hydrate-project.test.ts tests/server/db/advisory-lock.test.ts`

- [ ] **Step 3: Implement the service around a project-specific advisory lock**

The lock key is `bill-hydration:${source}:${externalId}`. A completed record is fresh for 30 minutes; a running record is stale after 5 minutes. Failures use `sourceErrorCode` and never delete stored events.

- [ ] **Step 4: Run hydration tests**

Run: `npm test -- tests/server/legislative/hydrate-project.test.ts tests/server/db/advisory-lock.test.ts tests/jobs/sync-source.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/server/legislative/hydrate-project.ts src/server/db/advisory-lock.ts src/jobs/sync-source.ts tests/server/legislative/hydrate-project.test.ts tests/server/db/advisory-lock.test.ts
git commit -m "feat: hydrate project history on demand"
```

### Task 5: Descoberta e hidratação bicameral exata

**Files:**
- Modify: `src/domain/legislative.ts`
- Modify: `src/integrations/camara/client.ts`
- Modify: `src/integrations/senado/client.ts`
- Create: `src/server/legislative/reconcile-bicameral.ts`
- Create: `tests/server/legislative/reconcile-bicameral.test.ts`
- Modify: `tests/integrations/camara/client.test.ts`
- Modify: `tests/integrations/senado/client.test.ts`

**Interfaces:**
- Produces: optional adapter method `findBillsByOfficialIdentity(identity): Promise<Bill[]>`.
- Produces: `ensureBicameralPartner(bill, dependencies): Promise<{ source; externalId } | null>`.

- [ ] **Step 1: Write failing exact-match tests**

Cover exactly one partner, no result, ambiguous result, same-source result, incompatible official identity and an apensada with a different identity.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- tests/server/legislative/reconcile-bicameral.test.ts tests/integrations/camara/client.test.ts tests/integrations/senado/client.test.ts`

- [ ] **Step 3: Add exact identity queries to both official adapters**

Normalize official type, number and year after parsing every result. Do not use title, ementa, generated summary or fuzzy text matching.

- [ ] **Step 4: Implement the reconciler**

Require an official cross-house signal already present in the source record or its movements, exactly one remote match, upsert its summary graph and invoke the hydration service for that partner.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/server/legislative/reconcile-bicameral.test.ts tests/integrations/camara/client.test.ts tests/integrations/senado/client.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/domain/legislative.ts src/integrations/camara/client.ts src/integrations/senado/client.ts src/server/legislative/reconcile-bicameral.ts tests/server/legislative/reconcile-bicameral.test.ts tests/integrations/camara/client.test.ts tests/integrations/senado/client.test.ts
git commit -m "feat: discover exact bicameral partners"
```

### Task 6: Integrar hidratação à página pública e à leitura

**Files:**
- Modify: `app/projetos/[source]/[externalId]/page.tsx`
- Modify: `src/server/public/queries.ts`
- Modify: `src/server/public/read-models.ts`
- Modify: `tests/app/project-detail.test.tsx`
- Modify: `tests/server/public/queries.test.ts`

**Interfaces:**
- Produces in `PublicBill`: `historyLoadStatus: "pending" | "complete" | "failed"`.
- Consumes `hydrateProject` and `ensureBicameralPartner` before `getPublicBill`.

- [ ] **Step 1: Write failing page tests for all history states**

Assert that pending and failed states never render the factual empty-state message, while a completed graph with zero votes renders “A fonte oficial não publicou votações para esta matéria”.

- [ ] **Step 2: Write a bicameral read test with Câmara and Senado separated**

Seed the Senado matter plus the Câmara partner and assert both house groups remain distinct and newest-first.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm test -- tests/app/project-detail.test.tsx tests/server/public/queries.test.ts`

- [ ] **Step 4: Invoke hydration and reconciliation before the public query**

Catch only upstream hydration failures, retain the page summary, and pass the persisted status into the read model. Internal programming and database errors must still surface.

- [ ] **Step 5: Render truthful Portuguese copy for pending, failed and confirmed-empty states**

Keep all existing source links and the visual separation by house.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- tests/app/project-detail.test.tsx tests/server/public/queries.test.ts tests/ui/detail-components.test.tsx`

- [ ] **Step 7: Commit without staging the pre-existing unrelated hunk**

Use `git diff` and stage only the implementation hunks in `tests/server/public/queries.test.ts`.

```bash
git add app/projetos/[source]/[externalId]/page.tsx src/server/public/queries.ts src/server/public/read-models.ts tests/app/project-detail.test.tsx
git add -p tests/server/public/queries.test.ts
git commit -m "feat: load complete project history on visit"
```

### Task 7: Atualizar sincronismo, documentação e operação

**Files:**
- Modify: `src/jobs/sync-source.ts`
- Modify: `tests/jobs/sync-source.test.ts`
- Modify: `scripts/sync.ts`
- Modify: `README.md`
- Modify: `.env`

**Interfaces:**
- Consumes `LEGISLATIVE_HISTORY_START_YEAR` and the shared hydration service.
- Produces periodic refresh of followed bills and recently requested active bills without a global historical scan.

- [ ] **Step 1: Write failing sync tests**

Assert initial discovery begins on January 1 of the configured year, old active bills are refreshed only when followed/recent/bicameral, and historical checkpoints never change the incremental checkpoint.

- [ ] **Step 2: Run focused sync tests and confirm failure**

Run: `npm test -- tests/jobs/sync-source.test.ts`

- [ ] **Step 3: Replace month-window options and refresh the selected old bills**

Use `historyStartYear` in `syncSource`. Keep Câmara discovery explicitly presentation-date based; reuse hydration only for tracked and recent targets.

- [ ] **Step 4: Update operational documentation and local environment**

Document migration, backfill, resume, refresh and the exact PEC 221/2019 validation route. Set `LEGISLATIVE_HISTORY_START_YEAR=2019` in `.env` without changing secrets.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- tests/jobs/sync-source.test.ts tests/server/config.test.ts && npm run typecheck`

- [ ] **Step 6: Commit tracked files**

```bash
git add README.md .env.example scripts/sync.ts src/jobs/sync-source.ts tests/jobs/sync-source.test.ts
git commit -m "feat: sync legislative history from fixed year"
```

### Task 8: Migração, backfill real e validação final

**Files:**
- Modify only if validation exposes a defect in the files owned by Tasks 1–7.
- Record evidence in: `docs/superpowers/validation/2026-09-06-historico-legislativo-desde-2019.md`

**Interfaces:**
- Validates all public and operational interfaces from the previous tasks.

- [ ] **Step 1: Read the relevant bundled Next.js App Router guide before final page changes**

Run: `sed -n '1,240p' node_modules/next/dist/docs/01-app/03-building-your-application/02-data-fetching/index.md`

- [ ] **Step 2: Apply the additive migration**

Run: `npm run db:migrate`

- [ ] **Step 3: Run the real historical backfill**

Run: `npm run backfill:legislative -- --from=2019 --source=all`

Record start/end time, annual counts, downloaded volume when reported by official transport, database size before/after and any sanitized retry counts.

- [ ] **Step 4: Hydrate the acceptance case**

Open `/projetos/senado/9056435`, then query the database to confirm Câmara external ID `2233802` and its vote events were persisted.

- [ ] **Step 5: Verify the three known Câmara results**

Confirm the page contains the commission result `34 a 4`, first plenary turn `472 a 22`, and second plenary turn `461 a 19`, each under Câmara, while Senado remains a separate house section.

- [ ] **Step 6: Run the full automated gate under Node 26**

Run: `npm test && npm run typecheck && npm run build`

- [ ] **Step 7: Manually validate desktop and LAN mobile rendering**

Run the server on `0.0.0.0:3000`, confirm project search/filter pagination, reload-cache behavior and the PEC page on desktop and `http://192.168.15.4:3000`.

- [ ] **Step 8: Write validation evidence and commit**

```bash
git add docs/superpowers/validation/2026-09-06-historico-legislativo-desde-2019.md
git commit -m "docs: validate legislative history backfill"
```

