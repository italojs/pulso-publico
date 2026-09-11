# Impacto Prático por IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir explicações de impacto prático, sustentadas no texto oficial integral, em 600 páginas de projetos.

**Architecture:** O resumo de IA ganha um campo derivado opcional `practicalImpact`. Um catálogo persistente de itens congela os 600 IDs e registra seu estado de geração. A página detalhada exibe o novo bloco; o feed permanece com título e descrição curta.

**Tech Stack:** Next.js 16, React, TypeScript, Drizzle, PostgreSQL, Vitest, fontes oficiais Câmara/Senado, `pdftotext` e Codex local Terra.

**Spec:** `docs/superpowers/specs/2026-09-11-impacto-pratico-ia-design.md`

## Global Constraints

- Usar exatamente os 600 projetos congelados no início do lote.
- Usar somente `gpt-5.6-terra` local em esforço médio; nunca `OPENAI_API_KEY` ou API externa de IA.
- Respeitar 20 requisições por minuto por fonte e aguardar ao menos três segundos entre consultas à mesma fonte.
- Criar exemplos apenas quando explícitos ou consequência direta do documento oficial.
- Preservar o resumo anterior em qualquer falha de documento ou geração.
- Validar título 8–120, resumo 80–420 e impacto 80–520 caracteres.
- Não mostrar o impacto prático no feed.

---

### Task 1: Persistir impacto e estado do lote

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `drizzle/0014_ai_practical_impact.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `tests/server/db/migration-ai-practical-impact.test.ts`

**Produces:** `aiSummaries.practicalImpact`; tabela `aiSummaryBatchItems`; enum de estados `pending`, `processing`, `completed`, `needs_review`, `failed`.

- [ ] **Step 1: Write the failing migration test**

```ts
it("adds practical impact and resumable batch items", async () => {
  const migration = await readFile(new URL("../../../drizzle/0014_ai_practical_impact.sql", import.meta.url), "utf8");
  expect(migration).toContain('ADD COLUMN "practical_impact" text');
  expect(migration).toContain('CREATE TABLE "ai_summary_batch_items"');
  expect(migration).toContain('UNIQUE("bill_id","prompt_version")');
});
```

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/server/db/migration-ai-practical-impact.test.ts`

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Implement minimal schema and migration**

```ts
export const aiSummaryBatchStatusEnum = pgEnum("ai_summary_batch_status", ["pending", "processing", "completed", "needs_review", "failed"]);

// ai_summaries
practicalImpact: text("practical_impact"),

export const aiSummaryBatchItems = pgTable("ai_summary_batch_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  promptVersion: text("prompt_version").notNull(),
  rank: integer("rank").notNull(),
  status: aiSummaryBatchStatusEnum("status").default("pending").notNull(),
  documentHash: text("document_hash"),
  attempts: integer("attempts").default(0).notNull(),
  errorCode: text("error_code"),
  ...timestamps,
}, (table) => [
  unique("ai_summary_batch_items_bill_version_uq").on(table.billId, table.promptVersion),
  index("ai_summary_batch_items_status_rank_idx").on(table.status, table.rank),
]);
```

Generate migration with `npm run db:generate`; ensure only this schema change appears.

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/server/db/migration-ai-practical-impact.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/server/db/schema.ts drizzle tests/server/db/migration-ai-practical-impact.test.ts && git commit -m "feat: store practical AI impact summaries"`

### Task 2: Validar resumo integral v3

**Files:**
- Modify: `src/ai/summary.ts`
- Modify: `src/ai/repository.ts`
- Create: `tests/ai/summary.test.ts`
- Create: `tests/ai/repository.test.ts`

**Produces:** `BillSummaryInput.officialDocumentText`, `BillSummaryOutput.practicalImpact`, versão `plain-language-full-text-v3` e fingerprint do texto integral.

- [ ] **Step 1: Write failing contract tests**

```ts
it("accepts a practical impact in the defined range", async () => {
  const result = await generateValidatedSummary(provider, fullTextInput);
  expect(result.practicalImpact).toMatch(/^Na prática:/);
});

it("changes the fingerprint when the full official document changes", () => {
  expect(summaryFingerprint({ ...fullTextInput, officialDocumentText: "A" }))
    .not.toBe(summaryFingerprint({ ...fullTextInput, officialDocumentText: "B" }));
});
```

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/ai/summary.test.ts tests/ai/repository.test.ts`

Expected: FAIL because the current contract lacks document text and practical impact.

- [ ] **Step 3: Implement the validated v3 contract**

```ts
export const PROMPT_VERSION = "plain-language-full-text-v3";
const summaryOutput = z.object({
  friendlyTitle: z.string().trim().min(8).max(120),
  shortDescription: z.string().trim().min(80).max(420),
  practicalImpact: z.string().trim().min(80).max(520).nullable(),
}).strict();
```

Fingerprint input order is `[officialCode, officialTitle, officialSummary, promptVersion, sha256(officialDocumentText)]`. Extend repository read/save types while keeping old null values readable.

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/ai/summary.test.ts tests/ai/repository.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/ai tests/ai && git commit -m "feat: validate practical impact summaries"`

### Task 3: Exibir o impacto apenas na página detalhada

**Files:**
- Modify: `src/server/public/read-models.ts`
- Modify: `src/server/public/queries.ts`
- Modify: `app/projetos/[source]/[externalId]/page.tsx`
- Modify: `tests/server/public/queries.test.ts`
- Modify: `tests/app/project-detail.test.tsx`

**Produces:** `PublicBillCard.practicalImpact?: string | null` e bloco de página `O que muda na prática`.

- [ ] **Step 1: Write failing public read-model and page tests**

```ts
it("maps practical impact to the public project detail", async () => {
  const project = await getPublicBill(database, "senado", "9011297");
  expect(project?.practicalImpact).toContain("Na prática:");
});

it("renders practical impact only on a project detail page", async () => {
  mocks.getPublicBill.mockResolvedValue({ ...project, practicalImpact: "Na prática: haverá atendimento presencial." });
  render(await ProjectPage({ params: Promise.resolve({ source: "senado", externalId: "9011297" }) }));
  expect(screen.getByRole("heading", { name: "O que muda na prática" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/server/public/queries.test.ts tests/app/project-detail.test.tsx`

Expected: FAIL because no public impact field or heading exists.

- [ ] **Step 3: Implement mapping and rendering**

Select and map `aiSummaries.practicalImpact`. Within the existing AI card render:

```tsx
{project.practicalImpact ? <section className="aiSummary__impact" aria-labelledby="ai-practical-impact-title">
  <h2 id="ai-practical-impact-title">O que muda na prática</h2>
  <p>{project.practicalImpact}</p>
</section> : null}
<small>Explicação gerada por IA a partir de registros oficiais. Confira a fonte original.</small>
```

Do not pass this field to `ProjectCard` and do not change feed markup.

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/server/public/queries.test.ts tests/app/project-detail.test.tsx && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/server/public app/projetos tests/server/public/queries.test.ts tests/app/project-detail.test.tsx && git commit -m "feat: show practical impact on project pages"`

### Task 4: Congelar e retomar o lote de 600

**Files:**
- Create: `src/server/ai/practical-impact-batch.ts`
- Create: `scripts/prepare-practical-impact-batch.ts`
- Create: `tests/server/ai/practical-impact-batch.test.ts`
- Modify: `package.json`

**Produces:** `preparePracticalImpactBatch(database, { limit: 600, promptVersion })`, `claimPracticalImpactItems(database, limit)`, `completePracticalImpactItem`, `markPracticalImpactItem`.

- [ ] **Step 1: Write failing freeze and resume tests**

```ts
it("freezes 600 newest IDs and ignores bills that arrive later", async () => {
  await preparePracticalImpactBatch(database, { limit: 600, promptVersion: "plain-language-full-text-v3" });
  await insertNewerBill(database);
  expect((await preparePracticalImpactBatch(database, { limit: 600, promptVersion: "plain-language-full-text-v3" })).inserted).toBe(0);
  expect(await listBatchRanks(database)).toHaveLength(600);
});

it("marks unreadable sources for review without deleting prior summaries", async () => {
  await markPracticalImpactItem(database, billId, "needs_review", "DOCUMENT_TEXT_UNAVAILABLE");
  expect((await summaryFor(database, billId))?.shortDescription).toBe("Resumo anterior");
});
```

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/server/ai/practical-impact-batch.test.ts`

Expected: FAIL because batch operations do not exist.

- [ ] **Step 3: Implement selection, claims and CLI**

Use the current feed ordering expression: greatest movement/vote/presentation time descending then `bills.id` ascending. Persist ranks 1–600 with `onConflictDoNothing` on `(bill_id, prompt_version)`. Claims must update only `pending` rows to `processing` in rank order. The CLI accepts only `--limit=600`, rejects larger limits, logs counts only, and never reads an OpenAI key.

Add:

```json
"practical-impact:prepare": "node scripts/prepare-practical-impact-batch.ts --limit=600"
```

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/server/ai/practical-impact-batch.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/server/ai scripts/prepare-practical-impact-batch.ts tests/server/ai/practical-impact-batch.test.ts package.json && git commit -m "feat: checkpoint practical impact batch"`

### Task 5: Verificar e operar o lote local Terra

**Files:**
- Create: `scripts/verify-practical-impact-batch.ts`
- Create: `tests/scripts/verify-practical-impact-batch.test.ts`
- Modify: `docs/operations/galaxy-production.md`

**Produces:** `verifyPracticalImpactBatch(database, promptVersion)` report with `planned`, `completed`, `needsReview`, `failed`, `missingImpact`, `invalidLengths`.

- [ ] **Step 1: Write failing verifier test**

```ts
it("reports the 600 planned items and invalid generated fields", async () => {
  await insertBatchItem(database, { rank: 1, status: "completed" });
  const report = await verifyPracticalImpactBatch(database, "plain-language-full-text-v3");
  expect(report).toMatchObject({ planned: 600, missingImpact: 1, invalidLengths: 0 });
});
```

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/scripts/verify-practical-impact-batch.test.ts`

Expected: FAIL because the verifier is absent.

- [ ] **Step 3: Implement verification and worker protocol**

The verifier checks only v3 rows: 600 planned count, status distribution, missing/empty impact and field ranges. It never runs generation.

Document the worker sequence: atomically claim a pending item; fetch official document with three-second same-source spacing; extract PDF text or visually inspect pages; use local Terra to generate grounded title/summary/impact; validate; atomically save v3 summary and `completed` state. Use `needs_review` for unreadable/insufficient documents and `failed` for transport or validation errors. Never log credentials or complete document text.

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/scripts/verify-practical-impact-batch.test.ts && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add scripts/verify-practical-impact-batch.ts tests/scripts/verify-practical-impact-batch.test.ts docs/operations/galaxy-production.md && git commit -m "docs: operate practical impact batch"`

### Task 6: Produção, geração e validação manual

**Files:**
- Modify only generated Drizzle artifacts if generation corrects them.

- [ ] **Step 1: Apply migration**

Run: `node --env-file=.env.production.local ./node_modules/drizzle-kit/bin.cjs migrate`

Expected: one non-destructive migration applied.

- [ ] **Step 2: Freeze production batch**

Run: `node --env-file=.env.production.local scripts/prepare-practical-impact-batch.ts --limit=600`

Expected: first run selects 600; rerun reports zero inserts and 600 existing.

- [ ] **Step 3: Generate controlled content**

Revisit ranks 1–100 first and process ranks 101–600 after. Each worker must only process claimed records and respect official-source pacing. Use full documents and record non-readable sources for review.

- [ ] **Step 4: Verify stored results**

Run: `node --env-file=.env.production.local scripts/verify-practical-impact-batch.ts`

Expected: 600 planned; zero missing or out-of-range fields among completed rows. Report `needsReview` exactly if nonzero.

- [ ] **Step 5: Deploy and manually verify**

Run: `galaxy deploy --detach`, wait for a healthy blue-green rollout, then validate PL 1159/2026 plus one Câmara and one Senado record. The detail page must show `O que muda na prática`; the feed must not.

- [ ] **Step 6: Commit source artifacts only**

Run: `git add drizzle docs scripts src tests package.json && git commit -m "feat: generate practical impact summaries"`

Never commit `.env*`, database URLs, official PDFs or logs.
