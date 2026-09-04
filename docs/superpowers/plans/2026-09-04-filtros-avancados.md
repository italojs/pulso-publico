# Filtros Avançados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um painel avançado que filtre todo o acervo legislativo por identificação, tramitação, datas, votações, autoria e acompanhamento, com URLs compartilháveis e linguagem acessível.

**Architecture:** O domínio normaliza facetas determinísticas no momento da persistência, e o PostgreSQL executa todos os filtros e paginação. A busca comum permanece renderizada no servidor; somente o caso anônimo “Somente acompanhados” envia as chaves do `localStorage` por POST para a mesma camada de consulta. Um contrato único de filtros alimenta URL, consulta, contagem prévia, painel e etiquetas.

**Tech Stack:** Node.js 26, TypeScript 7, Next.js 16 App Router, React 19, Drizzle ORM, PostgreSQL 16/18, Zod 4, Vitest e Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-04-filtros-avancados-design.md`

## Global Constraints

- Usar somente dados oficiais da Câmara e do Senado; nenhum filtro depende de IA.
- Usar nomes cotidianos na interface e preservar os textos oficiais.
- Combinar grupos diferentes com E e valores do mesmo grupo com OU.
- Preservar filtros compartilháveis na URL; nunca incluir chaves anônimas de projetos acompanhados na URL.
- Tratar ausência de dado como “informação não disponível”, nunca como resposta negativa.
- Não adicionar dependências de produção.
- Ler `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` e `route.md` antes de alterar páginas ou Route Handlers.
- Seguir TDD: cada mudança funcional começa por um teste que falha.

---

## File Structure

**Create**

- `src/domain/bill-facets.ts`: parser do código oficial e classificações determinísticas de fase e resultado.
- `tests/domain/bill-facets.test.ts`: contrato das normalizações.
- `src/server/public/filter-contract.ts`: schema Zod do corpo das APIs de busca/contagem e limites de entrada.
- `app/api/projects/filter-count/route.ts`: contagem prévia do painel.
- `app/api/projects/search/route.ts`: busca paginada para acompanhamentos anônimos.
- `tests/server/public/filter-routes.test.ts`: autorização, validação e resposta das duas rotas.
- `src/ui/advanced-filters.tsx`: painel cliente, seções, prévia e envio.
- `src/ui/active-filter-chips.tsx`: etiquetas removíveis.
- `src/ui/anonymous-followed-results.tsx`: resultados paginados com chaves locais fora da URL.
- `tests/ui/advanced-filters.test.tsx`: interação e acessibilidade do painel.

**Modify**

- `src/server/db/schema.ts`: facetas persistidas e índices.
- `src/server/db/repositories.ts`: calcular facetas ao inserir/atualizar projetos e votações.
- `drizzle/0003_advanced_filters.sql`: novas colunas, backfill determinístico e índices.
- `drizzle/meta/0003_snapshot.json`: snapshot gerado do novo schema.
- `drizzle/meta/_journal.json`: registro da nova migração.
- `tests/server/db/repositories.test.ts`: persistência das facetas.
- `tests/setup-database.ts`: manter a limpeza compatível com o novo schema.
- `src/server/public/read-models.ts`: contrato completo de filtros, opções e ordenação.
- `src/server/public/search-params.ts`: parsing/serialização de arrays, intervalos e booleanos.
- `tests/server/public/search-params.test.ts`: URL, limites e round-trip.
- `src/server/public/queries.ts`: condições SQL, opções facetadas, contagem e ordenações.
- `tests/server/public/queries.test.ts`: cada filtro, E/OU, nulos e paginação.
- `src/auth/current-user.ts`: leitura de sessão reutilizável por Server Component e Route Handler.
- `app/page.tsx`: decidir entre resultados SSR e acompanhamento anônimo.
- `src/ui/feed-filters.tsx`: filtros rápidos e acionamento do painel avançado.
- `src/ui/pagination.tsx`: preservar todas as seleções.
- `app/globals.css`: painel lateral, tela móvel, etiquetas e estados.
- `README.md`: documentar os filtros e parâmetros públicos relevantes.

---

### Task 1: Normalizar facetas legislativas no domínio

**Files:**
- Create: `src/domain/bill-facets.ts`
- Create: `tests/domain/bill-facets.test.ts`

**Interfaces:**
- Produces: `parseProposalIdentity(officialCode: string): ProposalIdentity`
- Produces: `classifySimplifiedStage(statusLabel: string): SimplifiedStage`
- Produces: `classifyVoteResult(result: string | null): VoteResultCategory`
- Produces: `type SimplifiedStage = "presented" | "committees" | "ready_for_vote" | "voted" | "sanction_or_veto" | "closed" | "unclassified"`
- Produces: `type VoteResultCategory = "approved" | "rejected" | "other" | "unavailable"`

- [ ] **Step 1: Write failing normalization tests**

```ts
import { describe, expect, it } from "vitest";
import { classifySimplifiedStage, classifyVoteResult, parseProposalIdentity } from "#/domain/bill-facets";

describe("bill facets", () => {
  it.each([
    ["PEC 8/2025", { proposalType: "PEC", proposalNumber: 8, proposalYear: 2025 }],
    ["PLP nº 12, de 2024", { proposalType: "PLP", proposalNumber: 12, proposalYear: 2024 }],
    ["Texto sem identidade", { proposalType: null, proposalNumber: null, proposalYear: null }],
  ])("parses %s", (value, expected) => expect(parseProposalIdentity(value)).toEqual(expected));

  it.each([
    ["Aguardando parecer na comissão", "committees"],
    ["Pronta para pauta", "ready_for_vote"],
    ["Transformada em norma jurídica", "closed"],
    ["Situação inédita", "unclassified"],
  ])("classifies stage %s", (value, expected) => expect(classifySimplifiedStage(value)).toBe(expected));

  it.each([["Aprovado", "approved"], ["Rejeitada", "rejected"], ["Retirada de pauta", "other"], [null, "unavailable"]])(
    "classifies vote result %s",
    (value, expected) => expect(classifyVoteResult(value)).toBe(expected),
  );
});
```

- [ ] **Step 2: Run the test and confirm module-not-found failure**

Run: `npm test -- tests/domain/bill-facets.test.ts`

Expected: FAIL because `#/domain/bill-facets` does not exist.

- [ ] **Step 3: Implement explicit, accent-insensitive rules**

```ts
export type ProposalIdentity = { proposalType: string | null; proposalNumber: number | null; proposalYear: number | null };
export type SimplifiedStage = "presented" | "committees" | "ready_for_vote" | "voted" | "sanction_or_veto" | "closed" | "unclassified";
export type VoteResultCategory = "approved" | "rejected" | "other" | "unavailable";

const fold = (value: string) => value.normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "").toLowerCase();

export function parseProposalIdentity(officialCode: string): ProposalIdentity {
  const match = officialCode.toUpperCase().match(/^([A-Z]{2,10})\s*(?:N[º°O]?\s*)?(\d{1,9})(?:\s*[/,]\s*(?:DE\s*)?(\d{4}))?/);
  return match ? { proposalType: match[1] ?? null, proposalNumber: Number(match[2]), proposalYear: match[3] ? Number(match[3]) : null } : { proposalType: null, proposalNumber: null, proposalYear: null };
}
```

Add ordered keyword tables for the stage and vote result. Match specific terminal expressions before generic words such as `votad`, and return `unclassified`/`other` for ambiguity.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/domain/bill-facets.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the domain contract**

```bash
git add src/domain/bill-facets.ts tests/domain/bill-facets.test.ts
git commit -m "feat: normalize legislative filter facets"
```

---

### Task 2: Persistir facetas e migrar os registros existentes

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/repositories.ts`
- Modify: `tests/server/db/repositories.test.ts`
- Modify: `tests/setup-database.ts`
- Create: `drizzle/0003_advanced_filters.sql`
- Create: `drizzle/meta/0003_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: `parseProposalIdentity`, `classifySimplifiedStage`, `classifyVoteResult` from Task 1.
- Produces: columns `bills.proposalType`, `bills.proposalNumber`, `bills.proposalYear`, `bills.simplifiedStage`.
- Produces: column `voteEvents.resultCategory`.

- [ ] **Step 1: Add a failing repository test**

Extend the existing repository fixture with `officialCode: "PEC 8/2025"`, `statusLabel: "Aguardando parecer na comissão"` and a vote result `"Aprovado"`, then assert:

```ts
expect(await testDb.select({
  type: bills.proposalType,
  number: bills.proposalNumber,
  year: bills.proposalYear,
  stage: bills.simplifiedStage,
}).from(bills)).toEqual([{ type: "PEC", number: 8, year: 2025, stage: "committees" }]);

expect(await testDb.select({ category: voteEvents.resultCategory }).from(voteEvents))
  .toEqual([{ category: "approved" }]);
```

- [ ] **Step 2: Run the repository test and confirm missing-column failure**

Run: `npm test -- tests/server/db/repositories.test.ts`

Expected: FAIL because the Drizzle schema does not expose the facet columns.

- [ ] **Step 3: Add enums, columns and indexes to the Drizzle schema**

Add PostgreSQL enums for simplified stages and vote result categories. Add nullable identity fields, a non-null stage with default `unclassified`, and a non-null result category with default `unavailable`. Add indexes for `(proposal_type, proposal_year)`, `simplified_stage`, `(origin_house, current_house)`, `presented_at`, and `result_category`.

- [ ] **Step 4: Persist derived values on every upsert**

In `billValues`, merge `parseProposalIdentity(bill.officialCode)` and `simplifiedStage: classifySimplifiedStage(bill.statusLabel)`. In `voteValues`, add `resultCategory: classifyVoteResult(voteEvent.result)`.

- [ ] **Step 5: Generate and complete the migration**

Run: `npm run db:generate -- --name advanced_filters`

Confirm that the generated file is `drizzle/0003_advanced_filters.sql`. Add SQL backfill expressions that parse standard `TYPE NUMBER/YEAR` codes and categorize known status/result text with explicit `lower(...) LIKE` variants, without instalar extensões. Keep unmatched values null or in the default category. Do not delete official data.

- [ ] **Step 6: Migrate the test database and run repository tests**

Run: `DATABASE_URL='postgres://italojose@127.0.0.1:5435/legislativo_codex_test' npm test -- tests/server/db/repositories.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit schema and persistence**

```bash
git add src/server/db/schema.ts src/server/db/repositories.ts tests/server/db/repositories.test.ts tests/setup-database.ts drizzle
git commit -m "feat: persist advanced filter facets"
```

---

### Task 3: Criar o contrato de filtros e o round-trip da URL

**Files:**
- Modify: `src/server/public/read-models.ts`
- Modify: `src/server/public/search-params.ts`
- Modify: `tests/server/public/search-params.test.ts`

**Interfaces:**
- Produces: `PublicBillFilters` with arrays and intervals.
- Produces: `parseFeedSearchParams(params: RawSearchParams): PublicBillFilters`.
- Produces: `buildFeedHref(filters: Partial<PublicBillFilters>, page: number): string`.
- Produces: `countActiveFilters(filters: PublicBillFilters): number`.

- [ ] **Step 1: Replace scalar expectations with comprehensive failing tests**

```ts
const filters = parseFeedSearchParams({
  q: "  jornada ", tipo: ["PEC", "PL", "PEC"], numero: "8",
  anoInicio: "2024", anoFim: "2026", fonte: ["camara", "senado"],
  origem: "camara", casaAtual: ["senado", "nao_informada"], fase: "committees",
  situacao: ["Em análise", "Pronta para pauta"], apresentadaInicio: "2024-01-01",
  atividadeFim: "2026-09-04", votacao: "with", tipoVotacao: ["nominal", "secret"],
  votosIndividuais: "available", resultado: "approved", casaVotacao: "camara",
  tema: ["Trabalho", "Saúde"], autor: "Ana", partido: "ABC", uf: "SP",
  acompanhando: "1", ordem: "most_votes", pagina: "3",
});
expect(filters.proposalTypes).toEqual(["PEC", "PL"]);
expect(filters.sources).toEqual(["camara", "senado"]);
expect(filters.followedOnly).toBe(true);
expect(buildFeedHref(filters, 4)).toContain("tipo=PEC&tipo=PL");
expect(buildFeedHref(filters, 4)).not.toContain("followedBillKeys");
```

Also test invalid dates, reversed year/date intervals, maximum 20 values per group, 200-character text truncation and page reset.

- [ ] **Step 2: Run search-param tests and confirm contract failures**

Run: `npm test -- tests/server/public/search-params.test.ts`

Expected: FAIL against the scalar interface.

- [ ] **Step 3: Define exact filter types**

Use arrays for source, type, house, status, stage, vote kind/result/house, topic, author, party and UF. Use ISO date strings for inclusive date bounds. Define `votePresence`, `individualVoteAvailability`, `followedOnly`, and order values `updated`, `presented_desc`, `presented_asc`, `most_movements`, `most_votes`.

- [ ] **Step 4: Implement bounded parsing and serialization**

Create helpers `values`, `enumValues`, `positiveInteger`, `isoDate` and `appendAll`. Deduplicate without reordering, discard unknown enum values, cap every repeated field at 20, and omit `pageSize` and anonymous keys from the URL.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/server/public/search-params.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the public filter contract**

```bash
git add src/server/public/read-models.ts src/server/public/search-params.ts tests/server/public/search-params.test.ts
git commit -m "feat: define advanced filter URL contract"
```

---

### Task 4: Implementar consultas, facetas, contagem e ordenação

**Files:**
- Modify: `src/server/public/queries.ts`
- Modify: `tests/server/public/queries.test.ts`

**Interfaces:**
- Consumes: `PublicBillFilters` from Task 3 and persisted columns from Task 2.
- Produces: `PublicBillScope = { userId?: string; anonymousBillKeys?: Array<{ source: LegislativeSourceName; externalId: string }> }`.
- Produces: `countPublicBills(database, filters, scope?): Promise<number>`.
- Produces: `listPublicBills(database, filters, scope?): Promise<PublicBillPage>`.
- Produces: expanded `listPublicFilterOptions(database): Promise<PublicFilterOptions>`.

- [ ] **Step 1: Seed rows covering every facet**

Extend `seedPublicData()` with at least three projects so tests distinguish null identity, different houses/dates/stages, nominal/secret voting, missing individual votes, approved/rejected results, multiple topics/authors/parties/UFs and followed/unfollowed projects.

- [ ] **Step 2: Add failing table-driven query tests**

```ts
it.each([
  [{ proposalTypes: ["PEC"] }, ["PEC 8/2025"]],
  [{ proposalNumber: 12, yearFrom: 2024, yearTo: 2024 }, ["PL 12/2024"]],
  [{ originHouses: ["camara"], currentHouses: ["senado"] }, ["PL 12/2024"]],
  [{ votePresence: "without" }, ["Projeto sem votação"]],
  [{ voteKinds: ["nominal"], individualVoteAvailability: "available" }, ["PL 12/2024"]],
  [{ voteResults: ["approved"], voteHouses: ["camara"] }, ["PL 12/2024"]],
  [{ regions: ["SP"] }, ["PL 12/2024"]],
])("filters %#", async (filters, expected) => {
  const result = await listPublicBills(testDb, filters);
  expect(result.items.map((item) => item.officialCode)).toEqual(expected);
});
```

Add separate tests proving OR within `proposalTypes`/`topics`, AND across type/topic/date, inclusivity of date bounds, null-house selection, authenticated follows, anonymous key scope, each ordering, and `countPublicBills` parity with `listPublicBills.total`.

- [ ] **Step 3: Run query tests and confirm failures**

Run: `npm test -- tests/server/public/queries.test.ts`

Expected: FAIL because advanced conditions and scope are absent.

- [ ] **Step 4: Refactor one reusable condition builder**

Change `billConditions(filters, scope)` to add `inArray` for same-group OR, `exists` subqueries for topics/authors/lawmakers/vote events/individual votes/follows, inclusive `gte`/`lte` dates, and an OR-of-pairs expression for anonymous bill keys. Return an always-false SQL expression when `followedOnly` is true and the resolved scope is empty.

- [ ] **Step 5: Add aggregate order expressions**

Define aliased correlated counts for movements and votes. Append `bills.id` as the final deterministic tie-breaker for every ordering so pagination cannot shuffle equal records.

- [ ] **Step 6: Expand filter options**

Return distinct non-null types, years, houses, stages, statuses, vote categories/houses, topics, authors, parties and UFs. Include label/value pairs for normalized enums so UI copy never exposes English storage values.

- [ ] **Step 7: Run focused tests**

Run: `npm test -- tests/server/public/queries.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the query engine**

```bash
git add src/server/public/queries.ts tests/server/public/queries.test.ts
git commit -m "feat: query all advanced legislative facets"
```

---

### Task 5: Expor contagem e busca anônima com validação

**Files:**
- Create: `src/server/public/filter-contract.ts`
- Create: `app/api/projects/filter-count/route.ts`
- Create: `app/api/projects/search/route.ts`
- Create: `tests/server/public/filter-routes.test.ts`
- Modify: `src/auth/current-user.ts`

**Interfaces:**
- Consumes: `countPublicBills`, `listPublicBills`, `PublicBillFilters`, `PublicBillScope`.
- Produces: POST `/api/projects/filter-count` → `{ total: number }`.
- Produces: POST `/api/projects/search` → `PublicBillPage`.
- Produces: `currentUserFromCookie(cookieHeader: string | null, repository: UserRepository)`.

- [ ] **Step 1: Read the local Next.js Route Handler guide**

Run: `sed -n '1,260p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`

Expected: confirm Route Handler request/response and caching behavior for this installed Next.js version.

- [ ] **Step 2: Write failing route tests**

Test both handlers with same-origin POST requests. Assert 400 for unknown filters or more than 200 anonymous references, 403 for cross-origin requests, `{ total }` for valid count, pagination for valid search, server-derived user scope when authenticated, and no echo of anonymous keys in responses.

- [ ] **Step 3: Run route tests and confirm module-not-found failure**

Run: `npm test -- tests/server/public/filter-routes.test.ts`

Expected: FAIL because the routes do not exist.

- [ ] **Step 4: Implement a strict request schema**

```ts
const billReference = z.object({ source: z.enum(["camara", "senado"]), externalId: z.string().min(1).max(200) });
export const filterRequest = z.object({
  filters: publicBillFiltersSchema,
  anonymousBillKeys: z.array(billReference).max(200).default([]),
}).strict();
```

Define `publicBillFiltersSchema` from the exact enums and bounds in Task 3 instead of accepting arbitrary query-shaped objects.

- [ ] **Step 5: Implement shared scope resolution**

Resolve a signed-in user from the cookie first. When signed in, ignore client-provided keys and pass `{ userId }`. Otherwise validate/deduplicate bill references and pass `{ anonymousBillKeys }`. Apply `sameOrigin` before reading the request body.

- [ ] **Step 6: Run focused route tests**

Run: `npm test -- tests/server/public/filter-routes.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the HTTP boundary**

```bash
git add src/server/public/filter-contract.ts app/api/projects/filter-count/route.ts app/api/projects/search/route.ts tests/server/public/filter-routes.test.ts src/auth/current-user.ts
git commit -m "feat: expose bounded advanced filter endpoints"
```

---

### Task 6: Construir o painel avançado e as etiquetas ativas

**Files:**
- Create: `src/ui/advanced-filters.tsx`
- Create: `src/ui/active-filter-chips.tsx`
- Create: `tests/ui/advanced-filters.test.tsx`
- Modify: `src/ui/feed-filters.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `PublicBillFilters`, `PublicFilterOptions`, `buildFeedHref`, `countActiveFilters`.
- Produces: `AdvancedFilters({ filters, options, anonymousBillKeys? })`.
- Produces: `ActiveFilterChips({ filters })`.

- [ ] **Step 1: Write failing interaction tests**

Render `FeedFilters` with complete options and assert:

```ts
expect(screen.getByRole("button", { name: /filtros avançados/i })).toHaveTextContent("3");
await user.click(screen.getByRole("button", { name: /filtros avançados/i }));
expect(screen.getByRole("dialog", { name: /filtros avançados/i })).toBeVisible();
await user.keyboard("{Escape}");
expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: /filtros avançados/i })).toHaveFocus();
```

Also assert section labels, repeated hidden inputs for multi-select values, removable chips, “Limpar tudo”, focus containment, 300 ms debounced count request, cancellation of the prior request and status announcement.

- [ ] **Step 2: Run UI tests and confirm failures**

Run: `npm test -- tests/ui/advanced-filters.test.tsx`

Expected: FAIL because panel and chips do not exist.

- [ ] **Step 3: Split quick and advanced controls**

Keep keyword, source, status and topic in the visible form. Use one client-controlled dialog panel for the remaining fields. Use native inputs/selects/checkboxes and semantic fieldsets; do not add a component library.

- [ ] **Step 4: Implement preview count safely**

Serialize the draft filter state to the strict POST body. Debounce by 300 ms with `setTimeout`, abort the previous fetch through `AbortController`, retain the last valid count during transient failures, and change the footer copy to “Não foi possível atualizar a contagem” on a non-abort error.

- [ ] **Step 5: Implement active chips through URLs**

Each chip calls `buildFeedHref` with only its own value removed and page 1. Date ranges get separate start/end chips; removing a preset clears both derived activity bounds. The clear-all link points to `/`.

- [ ] **Step 6: Add responsive and accessible styles**

Use a fixed right-side sheet at desktop widths and full viewport below 720 px. Add a backdrop, sticky header/footer, scrollable body, visible focus rings, 44 px minimum targets and `prefers-reduced-motion` handling.

- [ ] **Step 7: Run focused UI tests**

Run: `npm test -- tests/ui/advanced-filters.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit the advanced panel**

```bash
git add src/ui/advanced-filters.tsx src/ui/active-filter-chips.tsx src/ui/feed-filters.tsx tests/ui/advanced-filters.test.tsx app/globals.css
git commit -m "feat: add accessible advanced filter panel"
```

---

### Task 7: Integrar resultados SSR, paginação e acompanhamentos anônimos

**Files:**
- Create: `src/ui/anonymous-followed-results.tsx`
- Modify: `app/page.tsx`
- Modify: `src/ui/pagination.tsx`
- Modify: `tests/ui/advanced-filters.test.tsx`
- Modify: `tests/server/public/queries.test.ts`

**Interfaces:**
- Consumes: POST `/api/projects/search`, `LOCAL_FOLLOWS_KEY`, `parseLocalFollows`.
- Produces: `AnonymousFollowedResults({ filters }: { filters: PublicBillFilters })`.

- [ ] **Step 1: Read the local Next.js page guide**

Run: `sed -n '1,240p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`

Expected: confirm asynchronous `searchParams` behavior for this Next.js version.

- [ ] **Step 2: Add failing anonymous-follow tests**

Seed `localStorage` with one bill and one lawmaker. Render the anonymous result component and assert that only the bill reference is posted, no reference enters `history.location.search`, returned project cards render, API pagination posts the next page, and an empty local list renders instructions to follow a project.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm test -- tests/ui/advanced-filters.test.tsx`

Expected: FAIL because `AnonymousFollowedResults` is absent.

- [ ] **Step 4: Implement anonymous result loading**

Read and parse local follows after hydration, retain only `kind === "bill"`, POST the exact filter state and references to `/api/projects/search`, and render the existing `ProjectCard` grid. Use buttons for anonymous next/previous pages so references never enter the URL.

- [ ] **Step 5: Select SSR or anonymous mode in the page**

When `followedOnly` is false, retain the current Server Component query. When it is true, resolve the current user from cookies: authenticated users use SSR with `{ userId }`; unauthenticated users render `AnonymousFollowedResults`. Extract the repeated result header/grid/empty state into a small presentational component only if duplication would otherwise exceed one complete copy.

- [ ] **Step 6: Preserve every URL filter in normal pagination**

Continue to delegate to `buildFeedHref(filters, page)`. Add a test asserting multi-value, date, vote and order parameters survive previous/next links and `pagina` is the only changed value.

- [ ] **Step 7: Run integration-focused tests**

Run: `npm test -- tests/ui/advanced-filters.test.tsx tests/server/public/search-params.test.ts tests/server/public/queries.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit feed integration**

```bash
git add src/ui/anonymous-followed-results.tsx app/page.tsx src/ui/pagination.tsx tests/ui/advanced-filters.test.tsx tests/server/public/queries.test.ts
git commit -m "feat: integrate filtered and followed feed results"
```

---

### Task 8: Validar migração, desempenho, build e uso manual

**Files:**
- Modify: `README.md`
- Create: `docs/validation/2026-09-04-filtros-avancados-validation.md`

**Interfaces:**
- Consumes: all completed tasks.
- Produces: reproducible validation record.

- [ ] **Step 1: Update operational documentation**

Document the advanced panel, repeated URL parameters, normalized facets, anonymous-follow privacy behavior and migration command. State explicitly that filters use only official data and no AI request is made.

- [ ] **Step 2: Run migration against the local development database**

Run: `DATABASE_URL='postgres://italojose@127.0.0.1:5435/legislativo_codex_dev' npm run db:migrate`

Expected: migration completes without deleting bills, movements, votes or AI summaries.

- [ ] **Step 3: Verify backfill counts**

Run a read-only `psql` query reporting total bills, bills with parsed type/year, each simplified stage, total vote events and each result category. Record the exact counts in the validation document.

- [ ] **Step 4: Verify representative query plans**

Run `EXPLAIN (ANALYZE, BUFFERS)` for: type+year+topic, current house+stage+date, nominal vote+result+UF, and followed-user queries. Record execution time and whether intended indexes appear. If a sequential scan over a large relation dominates, add only the index demonstrated by that plan, regenerate the migration metadata and repeat this step.

- [ ] **Step 5: Run the full automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Validate manually in desktop and mobile viewports**

Start the app with the local development database. Check opening/closing, keyboard focus, all seven sections, E/OU combination behavior, active chips, clear-one/clear-all, zero-result state, browser Back, shared URL, signed-out local follows, signed-in follows and pagination. Repeat at 390×844 and at a desktop width of at least 1280 px.

- [ ] **Step 7: Record exact evidence**

Write command outputs, tested URLs, viewport sizes, observed result codes/counts, screenshots paths if captured and any known limitations in `docs/validation/2026-09-04-filtros-avancados-validation.md`. Do not write “validated” without the corresponding evidence.

- [ ] **Step 8: Commit documentation and validation**

```bash
git add README.md docs/validation/2026-09-04-filtros-avancados-validation.md
git commit -m "docs: validate advanced legislative filters"
```
