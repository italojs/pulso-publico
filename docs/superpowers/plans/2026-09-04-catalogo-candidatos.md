# Catálogo e análise de candidatos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um catálogo nacional de candidatos de 2026 com filtros padrão e avançados, perfil analítico, comparação neutra, vínculo parlamentar confirmado e acompanhamento autenticado.

**Architecture:** Um módulo eleitoral separado importa retratos oficiais do TSE para tabelas próprias e expõe read models públicos. Uma tabela de vínculo explicitamente confirmado conecta candidatura a parlamentar sem alterar as identidades da Câmara ou do Senado. As páginas usam Server Components para resultados e detalhes; os painéis de filtro e botões de acompanhamento são ilhas Client Component.

**Tech Stack:** Node.js 26.8.1, TypeScript 7, Next.js 16.3.4 App Router, React 19.2.8, PostgreSQL, Drizzle ORM 0.45.2, Zod 4.5.4, csv-parse 7.0.2, unzipper 0.12.5, Vitest 5 e Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-04-catalogo-candidatos-design.md`

## Global Constraints

- Use Node.js `>=26.8.1 <27` and retain the existing Node 26 features (`process.loadEnvFile`, `Temporal`, native `fetch`, Web Streams).
- Read the relevant local Next.js 16 guides in `node_modules/next/dist/docs/` before editing App Router code.
- Preserve all unrelated and pre-existing dirty-worktree changes; stage only the files named by the current task.
- Browse, filter, inspect and compare without login; require login only to follow candidates or filter followed candidates.
- Never score, rank by quality, infer ideology, recommend a vote or declare a comparison winner.
- Never publish a parliamentary link unless `candidate_lawmaker_links.status = 'confirmed'`.
- Distinguish missing financial data from a monetary value of zero.
- Store monetary values as integer centavos (`bigint` in PostgreSQL, decimal strings at the UI boundary).
- Do not import or expose CPF, título eleitoral, personal email, address or process identifiers.
- Do not use an LLM for candidate data, proposals, certificates, metrics or comparisons.
- Local parliamentary history remains limited to 36 months; production uses all configured official history.
- Use `apply_patch` for hand-authored edits and Drizzle generation only for mechanical migration artifacts.

---

### Task 1: Define the electoral domain and official CSV mapping

**Files:**
- Create: `src/domain/electoral.ts`
- Create: `src/integrations/tse/mapper.ts`
- Create: `tests/fixtures/tse/candidates.csv`
- Create: `tests/fixtures/tse/candidate-assets.csv`
- Create: `tests/fixtures/tse/campaign-receipts.csv`
- Create: `tests/fixtures/tse/campaign-expenses.csv`
- Create: `tests/integrations/tse/mapper.test.ts`

**Interfaces:**
- Produces `ElectoralCandidate`, `CandidateAsset`, `CampaignEntry`, `CandidateSocialLink`, `CandidateGovernmentPlan`, `CandidateDocument` and their Zod schemas.
- Produces `mapCandidateRow`, `mapAssetRow`, `mapCampaignReceiptRow`, `mapCampaignExpenseRow`, `mapSocialRow` and `moneyToCents`.
- Consumed by the TSE archive reader and electoral repository in Tasks 2–4.

- [ ] **Step 1: Add failing mapping tests using official-shaped, anonymized fixtures**

```ts
import { describe, expect, it } from "vitest";
import { mapAssetRow, mapCandidateRow, moneyToCents } from "#/integrations/tse/mapper";

describe("TSE electoral mapping", () => {
  it("maps one 2026 candidacy without retaining private identifiers", () => {
    const candidate = mapCandidateRow({
      ANO_ELEICAO: "2026", SQ_CANDIDATO: "260001234567", NM_CANDIDATO: "ANA CIDADÃ",
      NM_URNA_CANDIDATO: "ANA", NR_CANDIDATO: "1234", DS_CARGO: "DEPUTADO FEDERAL",
      SG_UF: "ES", SG_PARTIDO: "ABC", NR_PARTIDO: "12", DS_SITUACAO_CANDIDATURA: "APTO",
      NR_CPF_CANDIDATO: "00000000000", DS_EMAIL: "ana@example.invalid",
    }, "2026-09-04T12:00:00.000Z");

    expect(candidate).toMatchObject({ electionYear: 2026, externalId: "260001234567", office: "deputado_federal", region: "ES" });
    expect(candidate).not.toHaveProperty("cpf");
    expect(candidate).not.toHaveProperty("email");
  });

  it("converts Brazilian currency to exact centavos", () => {
    expect(moneyToCents("1.234,56")).toBe(123456n);
    expect(moneyToCents("0,00")).toBe(0n);
  });

  it("preserves an explicitly declared zero-value asset", () => {
    expect(mapAssetRow({ ANO_ELEICAO: "2026", SQ_CANDIDATO: "260001234567", VR_BEM_CANDIDATO: "0,00", DS_TIPO_BEM_CANDIDATO: "Outros" }))
      .toMatchObject({ candidateExternalId: "260001234567", valueCents: 0n });
  });
});
```

- [ ] **Step 2: Run the mapper test and verify RED**

Run: `npm test -- tests/integrations/tse/mapper.test.ts`

Expected: FAIL because `#/domain/electoral` and `#/integrations/tse/mapper` do not exist.

- [ ] **Step 3: Implement strict normalized electoral records**

```ts
export const CandidateOffice = z.enum([
  "presidente", "vice_presidente", "governador", "vice_governador", "senador",
  "primeiro_suplente", "segundo_suplente", "deputado_federal", "deputado_estadual", "deputado_distrital",
]);

export const ElectoralCandidateRecord = z.object({
  electionYear: z.number().int().min(2026), externalId: z.string().min(1), fullName: z.string().min(1),
  ballotName: z.string().min(1), socialName: z.string().nullable(), number: z.number().int().nonnegative(),
  office: CandidateOffice, round: z.number().int().positive(), region: z.string().min(2).max(3),
  electoralUnit: z.string().min(1), status: z.string().min(1), statusDetail: z.string().nullable(),
  partyAcronym: z.string().min(1), partyNumber: z.number().int().positive(), partyName: z.string().min(1),
  federation: z.string().nullable(), coalition: z.string().nullable(), seekingReelection: z.boolean(),
  birthDate: z.iso.date().nullable(), ageAtInauguration: z.number().int().nonnegative().nullable(),
  gender: z.string().nullable(), race: z.string().nullable(), education: z.string().nullable(),
  occupation: z.string().nullable(), maritalStatus: z.string().nullable(), nationality: z.string().nullable(),
  birthRegion: z.string().nullable(), birthCity: z.string().nullable(), officialUrl: z.url(), checkedAt: z.iso.datetime(),
});
```

Implement explicit lookup maps for TSE office labels and booleans. Reject unknown required office/status shapes with `TseContractError`; normalize optional blank values to `null`; never copy unapproved columns into returned records.
For declared social links, accept only absolute `https:` or `http:` URLs without embedded credentials, preserve the declared label and drop invalid protocols instead of rendering them.

- [ ] **Step 4: Parse money without floating point**

```ts
export function moneyToCents(value: string): bigint {
  const normalized = value.trim().replaceAll(".", "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new TseContractError("INVALID_MONEY");
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}
```

- [ ] **Step 5: Run the mapper tests and domain typecheck**

Run: `npm test -- tests/integrations/tse/mapper.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the domain and mapping slice**

```bash
git add src/domain/electoral.ts src/integrations/tse/mapper.ts tests/fixtures/tse tests/integrations/tse/mapper.test.ts
git commit -m "feat: map official TSE candidate data"
```

---

### Task 2: Stream and validate TSE ZIP resources

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/integrations/tse/archive-reader.ts`
- Create: `src/integrations/tse/client.ts`
- Create: `src/integrations/tse/media-store.ts`
- Create: `tests/integrations/tse/client.test.ts`
- Create: `tests/integrations/tse/media-store.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes the mapping functions from Task 1.
- Produces `TseOpenDataClient.streamRows(resource, signal)`, `streamRegionalMedia(kind, region, signal)`, `TseResourceName` and `TseRegionalMediaKind`.
- Produces `ElectoralMediaStore.stage(runId, entry)`, `publish(runId)`, `discard(runId)` and `open(storageKey)`.
- Returns `AsyncIterable`s so CSV records and binary entries are processed with bounded memory.

- [ ] **Step 1: Write failing client tests for bounded streaming, encoding and contract rejection**

```ts
it("streams every CSV row from a ZIP response", async () => {
  const client = new TseOpenDataClient({ fetch: fakeZipFetch(twoCandidateRows), baseUrl: "https://cdn.tse.jus.br/" });
  const rows = [];
  for await (const row of client.streamRows("candidates", AbortSignal.timeout(1_000))) rows.push(row);
  expect(rows).toHaveLength(2);
});

it("rejects HTML error pages and archives without the expected CSV", async () => {
  const client = new TseOpenDataClient({ fetch: async () => new Response("<html>bloqueado</html>", { headers: { "content-type": "text/html" } }), baseUrl: "https://cdn.tse.jus.br/" });
  await expect(async () => { for await (const _row of client.streamRows("candidates")) void _row; })
    .rejects.toMatchObject({ code: "INVALID_ARCHIVE_RESPONSE" });
});

it("accepts only the expected image and PDF entries from a regional archive", async () => {
  const client = new TseOpenDataClient({ fetch: fakeZipFetch(photoAndTraversalEntries), baseUrl: "https://cdn.tse.jus.br/" });
  await expect(collect(client.streamRegionalMedia("photos", "ES")))
    .rejects.toMatchObject({ code: "UNSAFE_ARCHIVE_ENTRY" });
});
```

- [ ] **Step 2: Run the client test and verify RED**

Run: `npm test -- tests/integrations/tse/client.test.ts`

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Add the audited ZIP dependency**

Run: `npm install unzipper@0.12.5 && npm install --save-dev @types/unzipper@0.10.11`

Expected: `package-lock.json` records exact resolved versions and `npm audit --omit=dev` reports no unresolved production vulnerability introduced by this dependency.

- [ ] **Step 4: Implement resource allowlists and Web Stream bridging**

```ts
export const TSE_RESOURCES = {
  candidates: "estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
  complements: "estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip",
  assets: "estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip",
  coalitions: "estatistica/sead/odsele/consulta_coligacao/consulta_coligacao_2026.zip",
  social: "estatistica/sead/odsele/consulta_cand/rede_social_candidato_2026.zip",
  campaignAccounts: "estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip",
} as const;

export const TSE_REGIONAL_MEDIA = {
  photos: (region: TseRegion) => `estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_${region}_div.zip`,
  governmentPlans: (region: TseRegion) => `estatistica/sead/odsele/proposta_governo/proposta_governo_2026_${region}.zip`,
  certificates: (region: TseRegion) => `estatistica/sead/odsele/certidao_criminal/certidao_criminal_2026_${region}.zip`,
} as const;
```

Use `Readable.fromWeb(response.body)` with `unzipper.Parse({ forceStream: true })`. For tabular resources, accept only the documented `.csv`/`.txt` entries, cap every uncompressed entry, decode the TSE encoding explicitly and parse semicolon-delimited rows with `csv-parse`. For media, accept only `.jpg`/`.jpeg` for photos and `.pdf` for plans/certificates, validate magic bytes, reject absolute paths and `..`, cap each file and the total archive, and derive `SQ_CANDIDATO` only through a tested filename parser. `TseRegion` is an enum containing `BR` plus the 27 UFs, so no caller-controlled path reaches the URL. Set a descriptive `User-Agent`, timeout every request and reject redirects outside `cdn.tse.jus.br`.

- [ ] **Step 5: Implement generation-based local media storage**

Write one streamed entry at a time below `.data/electoral-assets/.staging/{runId}` with exclusive file creation. `publish(runId)` atomically renames the validated staging directory to `.data/electoral-assets/{runId}`; `discard(runId)` removes only that validated run directory; `open(storageKey)` resolves only normalized keys below the configured root. Add `.data/electoral-assets/` to `.gitignore`. Never persist raw archives. Tests must cover traversal, duplicate names, interrupted staging, atomic publication and lookup outside the root.

- [ ] **Step 6: Run client, media, mapper and type tests**

Run: `npm test -- tests/integrations/tse/client.test.ts tests/integrations/tse/media-store.test.ts tests/integrations/tse/mapper.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the archive client and media store**

```bash
git add package.json package-lock.json .gitignore src/integrations/tse/archive-reader.ts src/integrations/tse/client.ts src/integrations/tse/media-store.ts tests/integrations/tse/client.test.ts tests/integrations/tse/media-store.test.ts
git commit -m "feat: stream official TSE archives and media"
```

---

### Task 3: Add electoral persistence and atomic snapshots

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/electoral/repository.ts`
- Create: `tests/server/electoral/repository.test.ts`
- Modify: `tests/setup-database.ts`
- Create: `drizzle/0006_electoral_candidates.sql`
- Create: `drizzle/meta/0006_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces `ElectoralRepository.persistSnapshot(snapshot)`, `recordFailure`, `confirmLawmakerLink` and `rejectLawmakerLink`.
- Produces Drizzle tables matching the data model in the spec.
- Consumed by sync, public queries and follows.

- [ ] **Step 1: Write failing repository tests for idempotency and atomic replacement**

```ts
it("publishes one complete snapshot idempotently", async () => {
  await repository.persistSnapshot(candidateSnapshot);
  await repository.persistSnapshot(candidateSnapshot);
  expect(await countRows(electoralCandidates)).toBe(1);
  expect(await countRows(candidateAssets)).toBe(2);
});

it("keeps the previous public snapshot when persistence fails", async () => {
  await repository.persistSnapshot(candidateSnapshot);
  await expect(repository.persistSnapshot(invalidDuplicateAssetSnapshot)).rejects.toThrow();
  expect(await repository.findCandidate(2026, candidateSnapshot.candidates[0]!.externalId)).not.toBeNull();
});

it("exposes only confirmed lawmaker links", async () => {
  await repository.createPendingLawmakerLink(candidateId, lawmakerId, "exact_name_region");
  expect(await repository.findConfirmedLawmaker(candidateId)).toBeNull();
});

it("preserves follows and reviewed lawmaker links across a refreshed snapshot", async () => {
  await repository.persistSnapshot(candidateSnapshot);
  await seedFollowAndConfirmedLink(candidateId);
  await repository.persistSnapshot(updatedCandidateSnapshot);
  expect(await loadFollowAndLink(candidateId)).toMatchObject({ followed: true, linkStatus: "confirmed" });
});
```

- [ ] **Step 2: Run the repository test and verify RED**

Run: `npm test -- tests/server/electoral/repository.test.ts`

Expected: FAIL because electoral tables and repository do not exist.

- [ ] **Step 3: Define schema with query-oriented indexes**

Create enums for candidate office and link status, then tables named in the spec. Required indexes include:

```ts
uniqueIndex("electoral_candidates_year_external_uq").on(table.electionYear, table.externalId),
index("electoral_candidates_catalog_idx").on(table.electionYear, table.region, table.office, table.partyAcronym),
index("electoral_candidates_status_idx").on(table.status),
index("candidate_assets_candidate_idx").on(table.candidateId),
index("candidate_campaign_totals_money_idx").on(table.revenueCents, table.expenseCents),
uniqueIndex("candidate_lawmaker_links_candidate_lawmaker_uq").on(table.candidateId, table.lawmakerId),
uniqueIndex("followed_candidates_user_candidate_uq").on(table.userId, table.candidateId),
```

Represent money with PostgreSQL `bigint({ mode: "bigint" })`. Add foreign keys with cascade only for child rows owned by the candidacy.
Store `photoStorageKey`, government-plan `storageKey` and document `storageKey` as normalized opaque keys, never absolute paths. Preserve `sourceArchiveUrl`, original filename, MIME type, source extraction time and local check time for each media record.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate`

Expected: only `0006_electoral_candidates.sql`, its snapshot and journal change. Inspect SQL to confirm unique keys, indexes, foreign keys and no destructive statement against legislative tables.

- [ ] **Step 5: Implement transactional publication**

```ts
export interface ElectoralSnapshot {
  electionYear: number;
  extractedAt: Date;
  candidates: ElectoralCandidate[];
  assets: CandidateAsset[];
  campaignEntries: CampaignEntry[];
  socialLinks: CandidateSocialLink[];
  governmentPlans: CandidateGovernmentPlan[];
  documents: CandidateDocument[];
}

async persistSnapshot(snapshot: ElectoralSnapshot) {
  return this.database.transaction(async (tx) => {
    const ids = await upsertCandidates(tx, snapshot.candidates);
    await replaceAssets(tx, snapshot.electionYear, ids, snapshot.assets);
    await replaceCampaignTotals(tx, snapshot.electionYear, ids, aggregateCampaign(snapshot.campaignEntries));
    await replaceSocialLinks(tx, snapshot.electionYear, ids, snapshot.socialLinks);
    await replaceGovernmentPlans(tx, snapshot.electionYear, ids, snapshot.governmentPlans);
    await replaceDocuments(tx, snapshot.electionYear, ids, snapshot.documents);
    await markSyncSuccessful(tx, snapshot.syncRunId, snapshot.extractedAt);
  });
}
```

Each `replace*` function deletes only child rows belonging to that election inside the same transaction and inserts the new normalized rows through the candidate-ID map. The implementation must write the successful sync marker only after every resource commits; failure records are written in a separate short transaction. Existing `candidate_lawmaker_links` and `followed_candidates` must survive a snapshot replacement because their candidate parent identity is upserted, not recreated.

- [ ] **Step 6: Update test truncation and run integration tests twice**

Run: `npm test -- tests/server/electoral/repository.test.ts && npm test -- tests/server/electoral/repository.test.ts`

Expected: both runs PASS, proving migration and cleanup are repeatable.

- [ ] **Step 7: Commit persistence**

```bash
git add src/server/db/schema.ts src/server/electoral/repository.ts tests/server/electoral/repository.test.ts tests/setup-database.ts drizzle/0006_electoral_candidates.sql drizzle/meta
git commit -m "feat: persist atomic electoral snapshots"
```

---

### Task 4: Build the electoral synchronization job and CLI

**Files:**
- Modify: `src/server/config.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Create: `src/jobs/sync-election.ts`
- Create: `src/jobs/reconcile-candidate-lawmakers.ts`
- Create: `scripts/sync-election.ts`
- Create: `scripts/manage-candidate-link.ts`
- Create: `tests/jobs/sync-election.test.ts`
- Create: `tests/jobs/reconcile-candidate-lawmakers.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes `TseOpenDataClient`, `ElectoralMediaStore` and `ElectoralRepository`.
- Produces `syncElection(client, mediaStore, repository, { electionYear, now })` and CLI `npm run sync:election`.
- Produces pending-link suggestions and an operator-only CLI `npm run candidates:link -- confirm|reject ...`; neither path auto-confirms a match.
- Returns a serializable report with per-resource rows, candidates, failed code, start and finish time.

- [ ] **Step 1: Write failing orchestration tests**

```ts
it("publishes only after every required TSE resource succeeds", async () => {
  const repository = fakeElectoralRepository();
  const media = fakeElectoralMediaStore();
  const report = await syncElection(fakeTseClient(allResources), media, repository, { electionYear: 2026, now });
  expect(report).toMatchObject({ failed: false, candidates: 2 });
  expect(media.publish).toHaveBeenCalledOnce();
  expect(repository.persistSnapshot).toHaveBeenCalledOnce();
});

it("records a stable failure code and does not publish a partial snapshot", async () => {
  const repository = fakeElectoralRepository();
  const media = fakeElectoralMediaStore();
  const report = await syncElection(fakeTseClient({ assets: new TseContractError("MISSING_COLUMNS") }), media, repository, { electionYear: 2026, now });
  expect(report).toMatchObject({ failed: true, errorCode: "MISSING_COLUMNS" });
  expect(media.discard).toHaveBeenCalledOnce();
  expect(media.publish).not.toHaveBeenCalled();
  expect(repository.persistSnapshot).not.toHaveBeenCalled();
});

it("creates only a pending suggestion for an exact name, UF, party and compatible office", async () => {
  const suggestions = await reconcileCandidateLawmakers(candidateRows, lawmakerRows);
  expect(suggestions).toEqual([
    expect.objectContaining({ candidateExternalId, lawmakerId, status: "pending", method: "exact_name_region_party_office" }),
  ]);
});
```

- [ ] **Step 2: Run the job test and verify RED**

Run: `npm test -- tests/jobs/sync-election.test.ts`

Expected: FAIL because `syncElection` does not exist.

- [ ] **Step 3: Add bounded configuration**

```ts
TSE_DATA_BASE_URL: z.url().default("https://cdn.tse.jus.br"),
ELECTORAL_MEDIA_DIRECTORY: z.string().min(1).default(".data/electoral-assets"),
ELECTION_YEAR: z.coerce.number().int().min(2026).max(9999).default(2026),
GEO_PROVIDER: z.enum(["none", "cloudflare", "vercel"]).default("none"),
```

Resolve `ELECTORAL_MEDIA_DIRECTORY` to an absolute path once at process startup and require a persistent volume for it in production. Document `GEO_PROVIDER=none` for local development. No API key is required for TSE bulk data.

- [ ] **Step 4: Implement aggregation and one advisory lock**

Use `withAdvisoryLock(sql, "electoral-sync-2026", ...)`. Stream candidate-related rows into normalized maps keyed by `SQ_CANDIDATO`; aggregate the candidate-account ZIP's receipt and expense entries by candidate, funding kind and expense category in `bigint`; reject a required resource when expected columns are absent. Stream the 28 regional sets (`BR` plus 27 UFs) for photos, government plans and certificates into a staging media generation, recording normalized storage keys and source archive URLs. Then publish that media generation, call `persistSnapshot` once with its keys, and remove the previous generation only after the database transaction succeeds. If media publication or persistence fails, discard only the new generation and retain both the previous database snapshot and its files.

- [ ] **Step 5: Add the Node 26 CLI**

```ts
import { loadEnvFile } from "node:process";

try { loadEnvFile(".env"); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

let closeDatabase: (() => Promise<void>) | undefined;
try {
  const [{ env }, databaseModule, { ElectoralRepository }, { TseOpenDataClient }, { ElectoralMediaStore }, { syncElection }] = await Promise.all([
    import("#/server/config"), import("#/server/db/client"), import("#/server/electoral/repository"),
    import("#/integrations/tse/client"), import("#/integrations/tse/media-store"), import("#/jobs/sync-election"),
  ]);
  closeDatabase = () => databaseModule.sql.end({ timeout: 5 });
  const report = await syncElection(
    new TseOpenDataClient({ baseUrl: env.TSE_DATA_BASE_URL }),
    new ElectoralMediaStore(env.ELECTORAL_MEDIA_DIRECTORY),
    new ElectoralRepository(databaseModule.db),
    { electionYear: env.ELECTION_YEAR, now: () => new Date() },
  );
  console.log(JSON.stringify(report));
  if (report.failed) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ status: "failed", code: "STARTUP_ERROR" }));
  process.exitCode = 1;
} finally {
  await closeDatabase?.();
}
```

Add `"sync:election": "node scripts/sync-election.ts"` and `"candidates:link": "node scripts/manage-candidate-link.ts"` to package scripts.

- [ ] **Step 6: Implement conservative link reconciliation and review CLI**

After a successful snapshot, compare only normalized full name, UF/circumscription, party and office-compatible Câmara/Senado records to create or refresh `pending` suggestions. Ambiguous matches produce no suggestion, and existing `confirmed`/`rejected` decisions are never overwritten. Implement strict non-interactive commands:

```bash
npm run candidates:link -- confirm --year=2026 --candidate=260001234567 --source=camara --lawmaker=220530 --evidence=https://dadosabertos.camara.leg.br/api/v2/deputados/220530
npm run candidates:link -- reject --year=2026 --candidate=260001234567 --source=camara --lawmaker=220530 --evidence=https://dadosabertos.tse.jus.br/dataset/candidatos-2026
```

The CLI must require an existing candidate and lawmaker, an official `https:` evidence URL from `tse.jus.br`, `camara.leg.br` or `senado.leg.br`, record reviewer timestamp/method and print a JSON result. It must never print private source rows.

- [ ] **Step 7: Run orchestration, reconciliation, config and CLI argument tests**

Run: `npm test -- tests/jobs/sync-election.test.ts tests/jobs/reconcile-candidate-lawmakers.test.ts tests/server/config.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit the synchronization slice**

```bash
git add src/server/config.ts .env.example package.json src/jobs/sync-election.ts src/jobs/reconcile-candidate-lawmakers.ts scripts/sync-election.ts scripts/manage-candidate-link.ts tests/jobs/sync-election.test.ts tests/jobs/reconcile-candidate-lawmakers.test.ts tests/server/config.test.ts README.md
git commit -m "feat: synchronize TSE election data"
```

---

### Task 5: Define candidate read models, URL contract and database filters

**Files:**
- Create: `src/server/candidates/read-models.ts`
- Create: `src/server/candidates/search-params.ts`
- Create: `src/server/candidates/queries.ts`
- Create: `src/server/candidates/filter-contract.ts`
- Create: `tests/server/candidates/search-params.test.ts`
- Create: `tests/server/candidates/queries.test.ts`
- Create: `tests/server/candidates/filter-contract.test.ts`
- Create: `app/api/candidates/filter-count/route.ts`

**Interfaces:**
- Produces `CandidateFilters`, `CandidateFilterOptions`, `PublicCandidateCard`, `PublicCandidatePage`, `PublicCandidateDetail` and `CandidateOrder`.
- Produces `parseCandidateSearchParams`, `buildCandidateHref`, `countCandidateFilters`, `listCandidates`, `countCandidates`, `listCandidateFilterOptions` and `getCandidateDetail`.
- Produces `CandidateFilterInput`, a JSON-safe strict wire schema with monetary ranges encoded as decimal-real strings, plus `toCandidateFilterInput`/`parseCandidateFilterInput` for count preview.

- [ ] **Step 1: Write failing URL round-trip tests for every filter in scope**

```ts
it("round-trips standard and advanced candidate filters", () => {
  const filters: CandidateFilters = {
    query: "ana 1234", electionYears: [2026], offices: ["deputado_federal"], regions: ["ES"], parties: ["ABC"],
    statuses: ["APTO"], ageMin: 30, ageMax: 60, genders: ["FEMININO"], races: ["PARDA"],
    assetMinCents: 10000000n, assetCountMin: 1, revenueMaxCents: 50000000n, balanceMinCents: 0n, hasGovernmentPlan: true,
    hasConfirmedLawmaker: true, lawmakerHouses: ["camara"], followedOnly: true,
    order: "updated", page: 3, pageSize: 20,
  };
  expect(parseCandidateSearchParams(toRaw(buildCandidateHref(filters, 3)))).toEqual(filters);
});
```

- [ ] **Step 2: Write failing query tests with candidates that differ on every filter group**

Seed at least three candidates, assets, campaign totals, one confirmed link, one pending link and one followed candidate. Assert standard filters, each range boundary, availability booleans, confirmed-only history, followed-only scope, ordering and pagination totals.

- [ ] **Step 3: Run URL and query tests and verify RED**

Run: `npm test -- tests/server/candidates/search-params.test.ts tests/server/candidates/queries.test.ts`

Expected: FAIL because candidate read/query modules do not exist.

- [ ] **Step 4: Implement an exact public filter type**

```ts
export interface CandidateFilters {
  query?: string; electionYears?: number[]; offices?: CandidateOffice[]; regions?: string[]; parties?: string[];
  rounds?: number[]; statuses?: string[]; federations?: string[]; coalitions?: string[];
  ageMin?: number; ageMax?: number; genders?: string[]; races?: string[];
  educations?: string[]; occupations?: string[];
  declaredAssets?: "yes" | "no"; assetMinCents?: bigint; assetMaxCents?: bigint;
  assetCountMin?: number; assetCountMax?: number; assetCategories?: string[];
  revenueMinCents?: bigint; revenueMaxCents?: bigint; expenseMinCents?: bigint; expenseMaxCents?: bigint;
  balanceMinCents?: bigint; balanceMaxCents?: bigint;
  fundingKinds?: Array<"public" | "private" | "own">;
  hasPhoto?: boolean; hasSocial?: boolean; hasGovernmentPlan?: boolean; hasCertificates?: boolean;
  hasFinance?: boolean; hasConfirmedLawmaker?: boolean; lawmakerHouses?: Array<"camara" | "senado">;
  activeMandate?: boolean; topics?: string[]; followedOnly?: boolean;
  order?: "name" | "number" | "updated" | "assets_desc" | "revenue_desc" | "expenses_desc" | "projects_desc" | "votes_desc";
  page?: number; pageSize?: number;
}
```

Use URL values in reais with at most two decimals and convert immediately to exact centavos. Reject reversed ranges instead of swapping them.

- [ ] **Step 5: Implement SQL filters with confirmed-link joins only**

Use `exists` subqueries for assets, availability, follows and topics so joins do not inflate counts. Use a confirmed-link condition in every legislative aggregation:

```ts
and(
  eq(candidateLawmakerLinks.candidateId, electoralCandidates.id),
  eq(candidateLawmakerLinks.status, "confirmed"),
)
```

Return `null` for missing campaign totals and decimal strings for public money values.

- [ ] **Step 6: Implement and test the strict count endpoint**

Reuse `sameOrigin`, the 65,536-byte request cap and `currentUserFromCookie`. Parse `{ filters: CandidateFilterInput }`, convert money strings to `bigint` only after strict validation and never pass a `bigint` through JSON. Return `401 AUTH_REQUIRED` only when `followedOnly` is true without a session; otherwise count remains public.

Run: `npm test -- tests/server/candidates && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the public candidate query contract**

```bash
git add src/server/candidates app/api/candidates/filter-count/route.ts tests/server/candidates
git commit -m "feat: query and filter election candidates"
```

---

### Task 6: Add trusted UF inference and catalog Server Component

**Files:**
- Create: `src/server/candidates/inferred-region.ts`
- Create: `tests/server/candidates/inferred-region.test.ts`
- Create: `app/candidatos/page.tsx`
- Modify: `src/ui/site-header.tsx`
- Modify: `tests/ui/components.test.tsx`

**Interfaces:**
- Produces `inferRegion(headers, provider): string | undefined`.
- `app/candidatos/page.tsx` resolves explicit URL filters before inferred region and passes `regionOrigin="ip" | "url" | undefined` to filters.

- [ ] **Step 1: Read the exact Next.js 16 APIs before coding**

Read completely:

```text
node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md
node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md
```

- [ ] **Step 2: Write failing trust-boundary tests**

```ts
expect(inferRegion(new Headers({ "cf-region-code": "ES" }), "cloudflare")).toBe("ES");
expect(inferRegion(new Headers({ "x-vercel-ip-country-region": "SP" }), "cloudflare")).toBeUndefined();
expect(inferRegion(new Headers({ "cf-region-code": "../../etc" }), "cloudflare")).toBeUndefined();
expect(inferRegion(new Headers({ "cf-region-code": "ES" }), "none")).toBeUndefined();
```

Also render `SiteHeader` and assert that `Projetos` and `Candidatos` are adjacent links.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- tests/server/candidates/inferred-region.test.ts tests/ui/components.test.tsx`

Expected: FAIL because inference and candidate navigation do not exist.

- [ ] **Step 4: Implement provider-specific inference**

Read only `cf-region-code` for `cloudflare`, only `x-vercel-ip-country-region` for `vercel`, and nothing for `none`; accept only the 27 explicit UF values. Never read or store the IP itself.

- [ ] **Step 5: Implement `/candidatos` data flow**

```tsx
const explicit = parseCandidateSearchParams(await searchParams);
const inferred = explicit.regions?.length ? undefined : inferRegion(await headers(), env.GEO_PROVIDER);
const filters = inferred ? { ...explicit, regions: [inferred] } : explicit;
const [page, options] = await Promise.all([listCandidates(db, filters, user ? { userId: user.id } : {}), listCandidateFilterOptions(db)]);
```

If `followedOnly` is requested without a user, redirect to `/entrar?next=` with the complete candidate URL. Render a source timestamp and an empty-state explanation when no electoral snapshot exists.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- tests/server/candidates/inferred-region.test.ts tests/ui/components.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit catalog routing and navigation**

```bash
git add src/server/candidates/inferred-region.ts tests/server/candidates/inferred-region.test.ts app/candidatos/page.tsx src/ui/site-header.tsx tests/ui/components.test.tsx
git commit -m "feat: add candidate catalog navigation"
```

---

### Task 7: Build candidate cards, standard filters and advanced panel

**Files:**
- Create: `src/ui/candidate-card.tsx`
- Create: `src/ui/candidate-results.tsx`
- Create: `src/ui/candidate-filters.tsx`
- Create: `src/ui/candidate-advanced-filters.tsx`
- Create: `src/ui/candidate-filter-chips.tsx`
- Create: `src/ui/candidate-pagination.tsx`
- Create: `tests/ui/candidate-catalog.test.tsx`
- Modify: `app/globals.css`
- Modify: `app/candidatos/page.tsx`

**Interfaces:**
- Consumes Task 5 read models and URL builders.
- Produces accessible card/list/filter components used by the catalog.
- Sends preview bodies only to `/api/candidates/filter-count`.

- [ ] **Step 1: Write failing user-facing tests**

```tsx
it("renders the four standard filters and advanced-filter count", () => {
  render(<CandidateFilters filters={{ parties: ["ABC"] }} options={options} authenticated={false} />);
  expect(screen.getByRole("searchbox", { name: "Buscar candidatos" })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Cargo" })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "UF" })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Partido" })).toBeVisible();
  expect(screen.getByRole("button", { name: /Filtros avançados/ })).toBeVisible();
});

it("marks an inferred UF and lets the visitor show Brazil", () => {
  render(<CandidateFilters filters={{ regions: ["ES"] }} regionOrigin="ip" options={options} authenticated={false} />);
  expect(screen.getByText("UF estimada: ES")).toBeVisible();
  expect(screen.getByRole("link", { name: "Mostrar Brasil inteiro" })).toHaveAttribute("href", "/candidatos");
});

it("disables followed-only for visitors and preserves the candidate return URL", () => {
  expect(openAdvanced().getByRole("checkbox", { name: "Somente candidatos seguidos" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Entrar para usar este filtro" })).toHaveAttribute("href", expect.stringContaining("%2Fcandidatos"));
});
```

- [ ] **Step 2: Run the catalog UI test and verify RED**

Run: `npm test -- tests/ui/candidate-catalog.test.tsx`

Expected: FAIL because candidate UI components do not exist.

- [ ] **Step 3: Implement standard controlled filters and URL-preserving submission**

Mirror the proven project flow: one GET form for query/cargo/UF/partido, hidden fields for advanced dimensions, `router.push(buildCandidateHref(..., 1))`, and URL-driven resynchronization after navigation.

- [ ] **Step 4: Implement the advanced dialog by responsibility**

Create small local components for searchable choices, range fields, radio groups and sections. Debounce preview by 300 ms, abort stale requests, retain the last valid count on transient failure, reject reversed ranges client-side and cap multi-selects at 20 values.

- [ ] **Step 5: Implement the catalog’s visual signature without changing the brand system**

Use existing tokens and typography. Give each card one restrained ballot-number rail: the candidate number in `--utility` type on a yellow tab attached to the photo edge. Keep the rest neutral: white surface, green status only for official availability, no partisan color mapping, no popularity bars.

- [ ] **Step 6: Add keyboard, mobile and reduced-motion assertions**

Assert a named dialog, Escape close, focus return, disabled visitor follow filter, explicit labels, textual financial values, one-column layout below the existing mobile breakpoint and no animation when `prefers-reduced-motion` is active.

Run: `npm test -- tests/ui/candidate-catalog.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the catalog interface**

```bash
git add src/ui/candidate-card.tsx src/ui/candidate-results.tsx src/ui/candidate-filters.tsx src/ui/candidate-advanced-filters.tsx src/ui/candidate-filter-chips.tsx src/ui/candidate-pagination.tsx tests/ui/candidate-catalog.test.tsx app/globals.css app/candidatos/page.tsx
git commit -m "feat: add candidate catalog filters"
```

---

### Task 8: Build the analytical candidate profile

**Files:**
- Create: `app/candidatos/[year]/[externalId]/page.tsx`
- Create: `app/api/candidates/media/[...segments]/route.ts`
- Create: `src/ui/candidate-profile.tsx`
- Create: `src/ui/candidate-finance.tsx`
- Create: `src/ui/candidate-assets.tsx`
- Create: `src/ui/candidate-history.tsx`
- Create: `tests/ui/candidate-profile.test.tsx`
- Create: `tests/server/candidates/media-route.test.ts`
- Modify: `src/server/candidates/queries.ts`
- Modify: `tests/server/candidates/queries.test.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Extends `getCandidateDetail(database, year, externalId, { projectPage, votePage })` with exact aggregates and paginated parliamentary records.
- Produces a read-only media route backed by `ElectoralMediaStore.open(storageKey)` for database-owned keys only.
- Renders every analytical block with its own source state.

- [ ] **Step 1: Read the Next.js route/image APIs and write failing detail-query tests**

Read completely:

```text
node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
```

Assert that the detail query returns identity, profile, nullable finance totals, asset categories, documents, social links and no history for a pending link. Change the link to confirmed and assert correct projects/votes and the configured coverage label.

Test the media route with a stored photo, a stored PDF, an unknown database key, a traversal segment and a key from an unpublished generation. Expect correct `Content-Type`/`nosniff` headers only for the two published assets and `404` for every other case.

- [ ] **Step 2: Write failing component tests for zero versus missing data**

```tsx
it("distinguishes zero finance from finance not published", () => {
  const { rerender } = render(<CandidateFinance finance={{ revenueCents: "0", expenseCents: "0", extractedAt }} />);
  expect(screen.getByText("R$ 0,00")).toBeVisible();
  rerender(<CandidateFinance finance={null} />);
  expect(screen.getByText("Ainda não disponibilizado pelo TSE")).toBeVisible();
});

it("does not turn an unconfirmed link into lack of political experience", () => {
  render(<CandidateHistory history={null} />);
  expect(screen.getByText("Não existe histórico parlamentar confirmado para esta candidatura.")).toBeVisible();
  expect(screen.queryByText(/sem experiência/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run detail tests and verify RED**

Run: `npm test -- tests/server/candidates/queries.test.ts tests/ui/candidate-profile.test.tsx`

Expected: FAIL on missing detail behavior and components.

- [ ] **Step 4: Implement exact neutral aggregates**

Return asset and campaign category distributions as labels plus decimal cent strings. For confirmed lawmakers, compute project/coauthor/vote totals and choice distribution from existing legislative records. Label the window from actual earliest/latest stored dates; never infer an absence or attendance failure from a missing individual vote.

- [ ] **Step 5: Implement the page sections and independent pagination**

Render header, declared profile, government plan, assets, campaign, documents/social, confirmed history and provenance in the spec order. Use `projetosPagina` and `votosPagina` search parameters so every stored record remains reachable without loading the full career into one response.

The media route must first resolve the requested normalized key from a currently published candidate, government-plan or document row; only then call the media store. Stream the file with its stored allowlisted MIME type, `X-Content-Type-Options: nosniff` and a bounded public cache header. Use the route URL for photos and download links, so absolute storage paths never reach HTML or JSON.

- [ ] **Step 6: Verify accessibility and responsive hierarchy**

Financial charts must have equivalent tables; links must identify TSE/Câmara/Senado; missing blocks must explain the source state. Reuse the ballot-number rail only in the hero and keep charts grayscale/green without qualitative red/green judgments.

Run: `npm test -- tests/ui/candidate-profile.test.tsx tests/server/candidates/queries.test.ts tests/server/candidates/media-route.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the analytical profile**

```bash
git add app/candidatos/'[year]'/'[externalId]'/page.tsx app/api/candidates/media/'[...segments]'/route.ts src/ui/candidate-profile.tsx src/ui/candidate-finance.tsx src/ui/candidate-assets.tsx src/ui/candidate-history.tsx tests/ui/candidate-profile.test.tsx tests/server/candidates/media-route.test.ts src/server/candidates/queries.ts tests/server/candidates/queries.test.ts app/globals.css
git commit -m "feat: add analytical candidate profiles"
```

---

### Task 9: Add compatible, neutral candidate comparison

**Files:**
- Create: `app/candidatos/comparar/page.tsx`
- Create: `src/ui/candidate-compare-picker.tsx`
- Create: `src/ui/candidate-comparison.tsx`
- Create: `tests/ui/candidate-comparison.test.tsx`
- Modify: `src/server/candidates/queries.ts`
- Modify: `tests/server/candidates/queries.test.ts`
- Modify: `src/ui/candidate-card.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces `compareCandidates(database, year, ids)` returning either `{ candidates }` or `{ error: "INCOMPATIBLE_CANDIDATES" | "TOO_MANY_CANDIDATES" }`.
- Picker keeps the user-selected column order and only offers compatible candidates after the first selection.

- [ ] **Step 1: Write failing compatibility tests**

```ts
await expect(compareCandidates(db, 2026, [deputyEsA, deputyEsB])).resolves.toMatchObject({ candidates: expect.any(Array) });
await expect(compareCandidates(db, 2026, [deputyEsA, senatorEs])).resolves.toEqual({ error: "INCOMPATIBLE_CANDIDATES" });
await expect(compareCandidates(db, 2026, [a, b, c, d])).resolves.toEqual({ error: "TOO_MANY_CANDIDATES" });
```

Render the table and assert equal fields, `Não informado pela fonte`, no winner/score wording and preserved selection order.

- [ ] **Step 2: Run comparison tests and verify RED**

Run: `npm test -- tests/ui/candidate-comparison.test.tsx tests/server/candidates/queries.test.ts`

Expected: FAIL because comparison does not exist.

- [ ] **Step 3: Implement server-side compatibility enforcement**

Deduplicate IDs, cap at three before querying, require identical `electionYear`, `office` and `electoralUnit`, and return no partial comparison on mismatch.

- [ ] **Step 4: Implement accessible side-by-side comparison**

Use a semantic table on wide screens and repeated labeled sections on small screens. Compare official status, profile fields, assets, campaign totals, documents and confirmed legislative totals. Do not highlight maximum/minimum values.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/ui/candidate-comparison.test.tsx tests/server/candidates/queries.test.ts && npm run typecheck`

```bash
git add app/candidatos/comparar/page.tsx src/ui/candidate-compare-picker.tsx src/ui/candidate-comparison.tsx tests/ui/candidate-comparison.test.tsx src/server/candidates/queries.ts tests/server/candidates/queries.test.ts src/ui/candidate-card.tsx app/globals.css
git commit -m "feat: compare compatible candidates"
```

---

### Task 10: Require an account to follow candidates

**Files:**
- Modify: `src/follows/follow-repository.ts`
- Modify: `app/api/follows/route.ts`
- Create: `src/ui/candidate-follow-button.tsx`
- Modify: `src/ui/following-page.tsx`
- Modify: `tests/follows/follows.test.ts`
- Modify: `tests/ui/follow-auth.test.tsx`
- Modify: `app/candidatos/[year]/[externalId]/page.tsx`

**Interfaces:**
- Extends `FollowReference` with `{ kind: "candidate"; electionYear: number; externalId: string }`.
- Returns candidate follow items with `provider: "tse"`, label, subtitle and `/candidatos/{year}/{externalId}` URL.
- Does not extend legacy anonymous local-follow parsing to new candidates.

- [ ] **Step 1: Write failing repository and UI tests**

```ts
it("follows a candidate idempotently in the authenticated account", async () => {
  expect(await follows.follow(user.id, { kind: "candidate", electionYear: 2026, externalId })).toBe(true);
  expect(await follows.follow(user.id, { kind: "candidate", electionYear: 2026, externalId })).toBe(true);
  expect((await follows.list(user.id)).filter((item) => item.kind === "candidate")).toHaveLength(1);
});

it("redirects a visitor without writing candidate state locally", async () => {
  render(<CandidateFollowButton electionYear={2026} externalId={externalId} href={href} />);
  fireEvent.click(await screen.findByRole("button", { name: "Seguir candidato" }));
  expect(routerPush).toHaveBeenCalledWith(`/entrar?next=${encodeURIComponent(href)}`);
  expect(localStorage.getItem("pulso:follows:v1")).toBeNull();
});
```

- [ ] **Step 2: Run follow tests and verify RED**

Run: `npm test -- tests/follows/follows.test.ts tests/ui/follow-auth.test.tsx`

Expected: FAIL because candidate references are unsupported.

- [ ] **Step 3: Extend the API as a discriminated union**

Bill/lawmaker commands continue requiring `source`; candidate commands require `electionYear`. Reject hybrid or unknown bodies through strict Zod objects. GET merges all three kinds and preserves reverse chronological follow order.

- [ ] **Step 4: Implement candidate follow UI and collection rendering**

Use the same login-return behavior already tested for projects/parliamentarians, server confirmation before pressed state and no localStorage write. Render a textual `TSE` source badge in `/seguindo`.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/follows/follows.test.ts tests/ui/follow-auth.test.tsx && npm run typecheck`

```bash
git add src/follows/follow-repository.ts app/api/follows/route.ts src/ui/candidate-follow-button.tsx src/ui/following-page.tsx tests/follows/follows.test.ts tests/ui/follow-auth.test.tsx app/candidatos/'[year]'/'[externalId]'/page.tsx
git commit -m "feat: follow election candidates with an account"
```

---

### Task 11: Load a real local snapshot and validate the complete experience

**Files:**
- Modify: `README.md`
- Create: `docs/validation/2026-09-04-catalogo-candidatos-validation.md`
- Modify only if verification exposes a defect: files owned by Tasks 1–10 plus their corresponding tests.

**Interfaces:**
- Produces a repeatable operator procedure and evidence for the delivered feature.

- [ ] **Step 1: Apply migration and run a real 2026 sync**

Run:

```bash
npm run db:migrate
npm run sync:election
```

Expected: JSON reports `failed:false`, a non-zero candidate count and source timestamps. If the official CDN is unavailable, record the exact stable error code, keep the last valid snapshot and do not claim real-data validation until a successful retry.

- [ ] **Step 2: Check data invariants without exposing private columns**

Run read-only SQL that confirms non-zero candidacies, unique `(election_year, external_id)`, exact campaign cent totals, zero published links with status other than `confirmed`, and absence of schema columns named for CPF, email or electoral title.

- [ ] **Step 3: Run the full automated gate**

Run:

```bash
npm run typecheck
TEST_DATABASE_URL=postgres://italojose@127.0.0.1:5435/legislativo_codex_test npm test
DATABASE_URL=postgres://italojose@127.0.0.1:5435/legislativo_codex_dev npm run build
git diff --check
```

Expected: typecheck PASS, all tests PASS with zero failures, production build PASS and no whitespace errors.

- [ ] **Step 4: Validate desktop manually**

At `http://127.0.0.1:3000`, verify menu order, catalog without login, standard filters, advanced preview, URL chips, pagination, inferred-UF absence on localhost, profile source labels, zero/missing finance states, confirmed/pending history behavior, compatible/incompatible comparison and candidate follow redirect.

- [ ] **Step 5: Validate mobile and accessibility manually**

Use a 390×844 viewport. Verify full-screen advanced filters, keyboard focus and Escape, one-column cards, readable financial tables, comparison reflow, no horizontal overflow, text equivalents for charts and reduced-motion behavior.

- [ ] **Step 6: Record evidence and operational commands**

Document timestamp, Node version, database window, synchronized resource counts, commands and observed results in `docs/validation/2026-09-04-catalogo-candidatos-validation.md`. Update README with sync cadence, `GEO_PROVIDER`, candidate routes and source-staleness behavior.

- [ ] **Step 7: Commit validation**

```bash
git add README.md docs/validation/2026-09-04-catalogo-candidatos-validation.md
git commit -m "docs: validate candidate catalog"
```

---

## Final review gate

After Task 11, invoke `requesting-code-review`. Address only findings proven against the approved spec, rerun the full automated gate and manual smoke flow, then invoke `verification-before-completion` before reporting success or merging.
