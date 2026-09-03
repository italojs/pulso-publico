# Legislative Data Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o núcleo testável que consulta, normaliza e persiste dados legislativos oficiais da Câmara dos Deputados e do Senado Federal.

**Architecture:** Um único repositório TypeScript contém a futura aplicação Next.js e módulos de servidor isolados por domínio. Adaptadores específicos transformam respostas externas em um modelo canônico; repositórios persistem esse modelo no PostgreSQL; jobs idempotentes executam sincronização incremental a cada 30 minutos e reconciliação diária. Testes usam fixtures locais e nunca dependem da disponibilidade das APIs oficiais.

**Tech Stack:** Node.js 26.8.1, npm 11.19, Next.js 16.3, React 19.2, TypeScript 7.0, PostgreSQL 18, Drizzle ORM 0.45, Zod 4.5, csv-parse 7.0, fast-xml-parser 5.11 e Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-03-acompanhamento-legislativo-mvp-design.md`

## Global Constraints

- O MVP cobre somente Câmara dos Deputados e Senado Federal.
- O desenvolvimento usa Node.js 26.8.1; antes do lançamento, atualizar para o patch 26.x mais recente e confirmar a passagem da linha 26 para LTS.
- Usar recursos estáveis do Node.js 26: `Temporal` para cálculos de datas, TypeScript nativo em scripts e `fetch` baseado em Undici 8.
- Para o TypeScript nativo, usar `import type` e somente sintaxe apagável; não usar `enum`, namespaces com runtime nem propriedades declaradas nos parâmetros do construtor.
- Não usar APIs experimentais do Node.js, incluindo `node:ffi`, no MVP.
- Todo dado factual armazenado deve preservar fonte oficial, identificador externo e momento da última verificação.
- A IA não faz parte deste plano e não pode preencher campos factuais ausentes.
- As APIs externas são consumidas somente pelo servidor.
- Datas persistidas usam `timestamp with time zone`; datas exibidas futuramente usam `America/Sao_Paulo`.
- Jobs incrementais rodam a cada 30 minutos; a reconciliação completa roda uma vez por dia.
- A carga inicial local usa uma janela móvel de 36 meses; em 3 de setembro de 2026, o corte é 3 de setembro de 2023.
- Tramitações e votos detalhados são hidratados sob demanda quando uma matéria é aberta ou seguida; documentos e anexos permanecem na fonte oficial.
- Uma falha externa mantém os últimos dados confirmados e não apaga registros válidos.
- Fixtures sanitizadas representam os contratos externos nos testes automatizados.

## File Structure

```text
app/
  layout.tsx                          # Shell mínimo até o plano de experiência pública
  page.tsx                            # Página inicial temporária de estado do projeto
  api/health/route.ts                 # Saúde do processo e atualidade das fontes
src/
  domain/legislative.ts               # Modelo canônico e contratos dos adaptadores
  server/config.ts                    # Validação das variáveis de ambiente
  server/http/retrying-fetch.ts       # Timeout e retentativas das chamadas oficiais
  server/db/client.ts                 # Conexão PostgreSQL
  server/db/schema.ts                 # Tabelas e enums normalizados
  server/db/repositories.ts           # Upserts transacionais e checkpoints
  integrations/camara/client.ts       # Chamadas HTTP da Câmara
  integrations/camara/bootstrap.ts    # Carga inicial pelos arquivos anuais CSV
  integrations/camara/mapper.ts       # Câmara para modelo canônico
  integrations/senado/client.ts       # Chamadas HTTP/XML do Senado
  integrations/senado/mapper.ts       # Senado para modelo canônico
  jobs/sync-source.ts                 # Sincronização incremental por fonte
  jobs/reconcile.ts                   # Reconciliação diária não destrutiva
scripts/sync.ts                       # Entrada de linha de comando para cron
scripts/reconcile.ts                  # Entrada diária de reconciliação
tests/
  fixtures/camara/*.json              # Respostas oficiais congeladas
  fixtures/senado/*.xml               # Respostas oficiais congeladas
  domain/legislative.test.ts
  server/http/retrying-fetch.test.ts
  server/db/repositories.test.ts
  integrations/camara/mapper.test.ts
  integrations/senado/mapper.test.ts
  jobs/sync-source.test.ts
  app/api/health/route.test.ts
docker-compose.yml
docker/postgres/init-test-db.sql
drizzle.config.ts
package.json
tsconfig.json
vitest.config.ts
.env.example
.nvmrc
.node-version
```

---

### Task 1: Executable TypeScript and PostgreSQL Foundation

**Files:**
- Create: `package.json`
- Create: `.nvmrc`
- Create: `.node-version`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `docker/postgres/init-test-db.sql`
- Create: `drizzle.config.ts`
- Create: `src/server/config.ts`
- Test: `tests/server/config.test.ts`

**Interfaces:**
- Consumes: nenhuma interface anterior.
- Produces: `env` com `DATABASE_URL`, `CAMARA_BASE_URL`, `SENADO_BASE_URL`, `HTTP_TIMEOUT_MS`, `HTTP_MAX_ATTEMPTS` e `INITIAL_HISTORY_MONTHS` validados.

- [ ] **Step 1: Initialize the package manifest**

Initialize version control:

```bash
git init -b main
```

Expected: Git creates a repository on branch `main` without modifying the specification or plans.

Create `package.json` with pinned runtime commands and dependencies:

```json
{
  "name": "acompanhamento-legislativo",
  "private": true,
  "type": "module",
  "packageManager": "npm@11.19.0",
  "engines": { "node": ">=26.8.1 <27" },
  "imports": { "#/*": "./src/*.ts" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "sync": "node scripts/sync.ts"
  },
  "dependencies": {
    "csv-parse": "7.0.2",
    "drizzle-orm": "0.45.2",
    "fast-xml-parser": "5.11.1",
    "next": "16.3.4",
    "postgres": "3.4.9",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "zod": "4.5.4"
  },
  "devDependencies": {
    "@types/node": "26.4.1",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.7",
    "drizzle-kit": "0.31.10",
    "dotenv": "17.4.2",
    "typescript": "7.0.2",
    "vitest": "5.0.0"
  }
}
```

Run: `npm install`

Expected: `package-lock.json` is created and npm exits with code 0.

Create `.nvmrc` and `.node-version`, each containing exactly:

```text
26.8.1
```

- [ ] **Step 2: Add compiler and test configuration**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "rewriteRelativeImportExtensions": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": { "#/*": ["./src/*.ts"] }
  },
  "include": ["app/**/*.ts", "app/**/*.tsx", "src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts", "*.ts"],
  "exclude": ["node_modules"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    restoreMocks: true,
    env: { DATABASE_URL: "postgres://app:app@localhost:5432/legislativo_test" },
  },
  resolve: { alias: { "#/": new URL("./src/", import.meta.url).pathname } },
});
```

- [ ] **Step 3: Write the failing environment validation test**

Create `tests/server/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "#/server/config";

describe("parseEnv", () => {
  it("rejects an absent database URL", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("supplies safe official-source defaults", () => {
    const value = parseEnv({ DATABASE_URL: "postgres://app:app@localhost:5432/legislativo" });
    expect(value.CAMARA_BASE_URL).toBe("https://dadosabertos.camara.leg.br/api/v2");
    expect(value.SENADO_BASE_URL).toBe("https://legis.senado.leg.br/dadosabertos");
    expect(value.HTTP_TIMEOUT_MS).toBe(10_000);
    expect(value.HTTP_MAX_ATTEMPTS).toBe(3);
    expect(value.INITIAL_HISTORY_MONTHS).toBe(36);
  });
});
```

- [ ] **Step 4: Run the test and verify the expected failure**

Run: `npm test -- tests/server/config.test.ts`

Expected: FAIL because `#/server/config` does not exist.

- [ ] **Step 5: Implement environment validation**

Create `src/server/config.ts`:

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url().startsWith("postgres"),
  CAMARA_BASE_URL: z.url().default("https://dadosabertos.camara.leg.br/api/v2"),
  SENADO_BASE_URL: z.url().default("https://legis.senado.leg.br/dadosabertos"),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  HTTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  INITIAL_HISTORY_MONTHS: z.coerce.number().int().min(1).max(120).default(36),
});

export function parseEnv(input: NodeJS.ProcessEnv) {
  return schema.parse(input);
}

export const env = parseEnv(process.env);
```

Create `.env.example`:

```dotenv
DATABASE_URL=postgres://app:app@localhost:5432/legislativo
CAMARA_BASE_URL=https://dadosabertos.camara.leg.br/api/v2
SENADO_BASE_URL=https://legis.senado.leg.br/dadosabertos
HTTP_TIMEOUT_MS=10000
HTTP_MAX_ATTEMPTS=3
INITIAL_HISTORY_MONTHS=36
```

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: legislativo
    ports:
      - "5432:5432"
    volumes:
      - ./docker/postgres/init-test-db.sql:/docker-entrypoint-initdb.d/001-test-db.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d legislativo"]
      interval: 2s
      timeout: 2s
      retries: 20
```

Create `docker/postgres/init-test-db.sql`:

```sql
CREATE DATABASE legislativo_test;
```

Create `drizzle.config.ts`:

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Create a minimal executable application shell:

```tsx
// app/layout.tsx
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}

// app/page.tsx
export default function HomePage() {
  return <main><h1>Acompanhamento legislativo</h1><p>Base de dados em preparação.</p></main>;
}
```

- [ ] **Step 6: Verify and commit the foundation**

Run: `npm test -- tests/server/config.test.ts && npx tsc --noEmit`

Expected: 2 tests pass and TypeScript exits with code 0.

```bash
git add docs package.json package-lock.json .nvmrc .node-version tsconfig.json vitest.config.ts .env.example docker-compose.yml docker/postgres/init-test-db.sql drizzle.config.ts app/layout.tsx app/page.tsx src/server/config.ts tests/server/config.test.ts
git commit -m "chore: initialize legislative data service"
```

---

### Task 2: Canonical Legislative Domain and Database Schema

**Files:**
- Create: `src/domain/legislative.ts`
- Create: `src/server/db/schema.ts`
- Create: `src/server/db/client.ts`
- Test: `tests/domain/legislative.test.ts`

**Interfaces:**
- Consumes: `env.DATABASE_URL` from Task 1.
- Produces: `LegislativeSource`, `BillRecord`, `BillAuthorRecord`, `BillTopicRecord`, `LawmakerRecord`, `MovementRecord`, `VoteEventRecord`, `IndividualVoteRecord`, `LegislativeSourceAdapter` and Drizzle tables keyed by `(source, externalId)`.

- [ ] **Step 1: Write failing tests for canonical records**

Create `tests/domain/legislative.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BillRecord, MovementRecord } from "#/domain/legislative";

describe("canonical legislative records", () => {
  it("accepts a sourced bill", () => {
    const bill = BillRecord.parse({
      source: "camara",
      externalId: "2347064",
      officialCode: "PL 1106/2023",
      congressionalKey: "pl:1106:2023",
      officialTitle: "Projeto de Lei 1106/2023",
      officialSummary: "Altera a legislação trabalhista.",
      originHouse: "camara",
      currentHouse: "camara",
      statusCode: "100",
      statusLabel: "Aguardando parecer",
      officialUrl: "https://www.camara.leg.br/propostas-legislativas/2347064",
      presentedAt: "2023-03-13T00:00:00.000Z",
      checkedAt: "2026-09-03T18:00:00.000Z"
    });
    expect(bill.officialCode).toBe("PL 1106/2023");
  });

  it("rejects a movement without provenance", () => {
    expect(() => MovementRecord.parse({ externalId: "move-1" })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/domain/legislative.test.ts`

Expected: FAIL because `#/domain/legislative` does not exist.

- [ ] **Step 3: Define exact canonical contracts**

Create `src/domain/legislative.ts` with these exported Zod schemas and inferred types:

```ts
import { z } from "zod";

export const LegislativeSource = z.enum(["camara", "senado"]);
export const House = z.enum(["camara", "senado", "congresso"]);
export const VoteChoice = z.enum(["sim", "nao", "abstencao", "obstrucao", "outro", "indisponivel"]);

const sourced = {
  source: LegislativeSource,
  externalId: z.string().min(1),
  officialUrl: z.url(),
  checkedAt: z.iso.datetime(),
};

export const BillRecord = z.object({
  ...sourced,
  officialCode: z.string().min(1),
  congressionalKey: z.string().min(1).nullable(),
  officialTitle: z.string().min(1),
  officialSummary: z.string().default(""),
  originHouse: House,
  currentHouse: House.nullable(),
  statusCode: z.string().nullable(),
  statusLabel: z.string().min(1),
  presentedAt: z.iso.datetime().nullable(),
});

export const BillAuthorRecord = z.object({
  ...sourced,
  billExternalId: z.string().min(1),
  lawmakerExternalId: z.string().min(1).nullable(),
  officialName: z.string().min(1),
  party: z.string().nullable(),
  authorKind: z.string().min(1),
  isPrimary: z.boolean(),
});

export const BillTopicRecord = z.object({
  ...sourced,
  billExternalId: z.string().min(1),
  code: z.string().nullable(),
  label: z.string().min(1),
});

export const LawmakerRecord = z.object({
  ...sourced,
  name: z.string().min(1),
  electoralName: z.string().min(1),
  role: z.enum(["deputado_federal", "senador"]),
  party: z.string().nullable(),
  region: z.string().length(2).nullable(),
  photoUrl: z.url().nullable(),
  active: z.boolean(),
});

export const MovementRecord = z.object({
  ...sourced,
  billExternalId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  sequence: z.number().int().nonnegative(),
  house: House,
  bodyCode: z.string().nullable(),
  bodyName: z.string().nullable(),
  statusCode: z.string().nullable(),
  statusLabel: z.string().nullable(),
  officialDescription: z.string().min(1),
});

export const VoteEventRecord = z.object({
  ...sourced,
  billExternalId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  house: House,
  description: z.string().min(1),
  result: z.string().nullable(),
  isNominal: z.boolean(),
  isSecret: z.boolean(),
});

export const IndividualVoteRecord = z.object({
  ...sourced,
  voteEventExternalId: z.string().min(1),
  lawmakerExternalId: z.string().min(1),
  choice: VoteChoice,
  rawChoice: z.string().min(1),
});

export type Bill = z.infer<typeof BillRecord>;
export type BillAuthor = z.infer<typeof BillAuthorRecord>;
export type BillTopic = z.infer<typeof BillTopicRecord>;
export type Lawmaker = z.infer<typeof LawmakerRecord>;
export type Movement = z.infer<typeof MovementRecord>;
export type VoteEvent = z.infer<typeof VoteEventRecord>;
export type IndividualVote = z.infer<typeof IndividualVoteRecord>;
export type LegislativeSourceName = z.infer<typeof LegislativeSource>;

export interface SyncPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface LegislativeSourceAdapter {
  readonly source: z.infer<typeof LegislativeSource>;
  listBillsChangedSince(since: Date, cursor?: string): Promise<SyncPage<Bill>>;
  getBill(billExternalId: string): Promise<Bill>;
  listBillAuthors(billExternalId: string): Promise<BillAuthor[]>;
  listBillTopics(billExternalId: string): Promise<BillTopic[]>;
  listBillMovements(billExternalId: string): Promise<Movement[]>;
  listBillVoteEvents(billExternalId: string): Promise<VoteEvent[]>;
  listIndividualVotes(voteEventExternalId: string): Promise<IndividualVote[]>;
  listActiveLawmakers(cursor?: string): Promise<SyncPage<Lawmaker>>;
}
```

- [ ] **Step 4: Define the normalized Drizzle schema**

Create `src/server/db/schema.ts`. Define PostgreSQL enums for source, house, role and vote choice, then tables `bills`, `lawmakers`, `billAuthors`, `billTopics`, `movements`, `voteEvents`, `individualVotes`, `syncCheckpoints` and `sourceHealth`.

Use UUID primary keys internally. Add unique indexes on `(source, externalId)` for every sourced entity, `(billId, externalId)` for authors and topics, and `(voteEventId, lawmakerId)` for individual votes. Store the complete normalized fields from Step 3 plus `createdAt` and `updatedAt`. Use foreign keys with `onDelete: "cascade"` only for child rows; never cascade-delete a bill or lawmaker because an upstream response omitted it.

Representative declaration:

```ts
export const bills = pgTable("bills", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: sourceEnum("source").notNull(),
  externalId: text("external_id").notNull(),
  officialCode: text("official_code").notNull(),
  congressionalKey: text("congressional_key"),
  officialTitle: text("official_title").notNull(),
  officialSummary: text("official_summary").notNull().default(""),
  originHouse: houseEnum("origin_house").notNull(),
  currentHouse: houseEnum("current_house"),
  statusCode: text("status_code"),
  statusLabel: text("status_label").notNull(),
  officialUrl: text("official_url").notNull(),
  presentedAt: timestamp("presented_at", { withTimezone: true }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("bills_source_external_id_uq").on(table.source, table.externalId)]);
```

Export every table and its `$inferInsert` type.

- [ ] **Step 5: Add the database client and migration**

Create `src/server/db/client.ts`:

```ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "#/server/config";
import * as schema from "#/server/db/schema";

export const sql = postgres(env.DATABASE_URL, { max: 10 });
export const db = drizzle(sql, { schema });
```

Run:

```bash
docker compose up -d postgres
cp .env.example .env
npm run db:generate
npm run db:migrate
```

Expected: Drizzle creates a migration under `drizzle/` and applies it without errors.

- [ ] **Step 6: Verify and commit the domain model**

Run: `npm test -- tests/domain/legislative.test.ts && npx tsc --noEmit`

Expected: 2 tests pass and TypeScript exits with code 0.

```bash
git add src/domain src/server/db tests/domain drizzle
git commit -m "feat: define canonical legislative model"
```

---

### Task 3: Resilient Official-Source HTTP Client

**Files:**
- Create: `src/server/http/retrying-fetch.ts`
- Test: `tests/server/http/retrying-fetch.test.ts`

**Interfaces:**
- Consumes: `env.HTTP_TIMEOUT_MS` and `env.HTTP_MAX_ATTEMPTS`.
- Produces: `retryingFetch(url: URL, init?: RequestInit): Promise<Response>` and `OfficialSourceError`.

- [ ] **Step 1: Write failing retry and timeout tests**

Create `tests/server/http/retrying-fetch.test.ts` using a stubbed `globalThis.fetch`. Assert that `503, 200` produces the second response, `404` is not retried, and three network failures throw `OfficialSourceError` with the URL but no response body.

Core test:

```ts
it("retries a temporary upstream failure", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("busy", { status: 503 }))
    .mockResolvedValueOnce(new Response("ok", { status: 200 }));

  const response = await retryingFetch(new URL("https://example.test/items"), {
    retry: { attempts: 3, baseDelayMs: 0, timeoutMs: 100 },
  });

  expect(await response.text()).toBe("ok");
  expect(fetch).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/server/http/retrying-fetch.test.ts`

Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Implement bounded retries**

Create an exported `RetryingRequestInit` type that extends `RequestInit` with `retry?: { attempts: number; baseDelayMs: number; timeoutMs: number }`. Implement `retryingFetch` with `AbortSignal.timeout`, exponential delays of `baseDelayMs * 2 ** attempt`, retries only for network errors, `408`, `429` and `5xx`, and immediate failure for other non-2xx statuses.

Expose this error shape:

```ts
export class OfficialSourceError extends Error {
  readonly url: string;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    url: string,
    status: number | null,
    retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OfficialSourceError";
    this.url = url;
    this.status = status;
    this.retryable = retryable;
  }
}
```

Do not include upstream response bodies in the error because they may contain unexpected or oversized content.

- [ ] **Step 4: Verify and commit the HTTP boundary**

Run: `npm test -- tests/server/http/retrying-fetch.test.ts && npx tsc --noEmit`

Expected: all HTTP client tests pass.

```bash
git add src/server/http tests/server/http
git commit -m "feat: add resilient official source client"
```

---

### Task 4: Câmara Adapter

**Files:**
- Create: `src/integrations/camara/client.ts`
- Create: `src/integrations/camara/bootstrap.ts`
- Create: `src/integrations/camara/mapper.ts`
- Create: `tests/fixtures/camara/proposicoes.csv`
- Create: `tests/fixtures/camara/proposicoes.json`
- Create: `tests/fixtures/camara/proposicao.json`
- Create: `tests/fixtures/camara/autores.json`
- Create: `tests/fixtures/camara/temas.json`
- Create: `tests/fixtures/camara/tramitacoes.json`
- Create: `tests/fixtures/camara/votacoes.json`
- Create: `tests/fixtures/camara/votos.json`
- Test: `tests/integrations/camara/mapper.test.ts`

**Interfaces:**
- Consumes: `retryingFetch` and all canonical contracts from Task 2.
- Produces: `CamaraAdapter implements LegislativeSourceAdapter`, `streamCamaraBillArchive` para a carga inicial e os mappers puros `mapCamaraBill`, `mapCamaraAuthor`, `mapCamaraTopic`, `mapCamaraMovement`, `mapCamaraVoteEvent` e `mapCamaraIndividualVote`.

- [ ] **Step 1: Capture official fixture shapes**

Download one small, currently available proposition and related collections from these official routes, then retain only the first representative item in each fixture:

```text
GET /proposicoes?dataInicio=2026-01-01&ordem=DESC&ordenarPor=id&itens=1
GET /proposicoes/{id}
GET /proposicoes/{id}/autores
GET /proposicoes/{id}/temas
GET /proposicoes/{id}/tramitacoes
GET /proposicoes/{id}/votacoes
GET /votacoes/{voteId}/votos
```

Store the unchanged JSON field names under `tests/fixtures/camara/`. Remove personal contact fields if the response includes them. Record the request URL and capture date in a top-level `_fixture` property ignored by the mapper.

- [ ] **Step 2: Write failing mapper tests**

Create `tests/integrations/camara/mapper.test.ts`:

```ts
import billFixture from "../../fixtures/camara/proposicao.json";
import movementFixture from "../../fixtures/camara/tramitacoes.json";
import { describe, expect, it } from "vitest";
import { mapCamaraBill, mapCamaraMovement } from "#/integrations/camara/mapper";

const checkedAt = new Date("2026-09-03T18:00:00.000Z");

describe("Câmara mapper", () => {
  it("preserves official bill provenance", () => {
    const result = mapCamaraBill(billFixture.dados, checkedAt);
    expect(result.source).toBe("camara");
    expect(result.externalId).toBe(String(billFixture.dados.id));
    expect(result.officialCode).toMatch(/^[A-Z]+ \d+\/\d{4}$/);
    expect(result.officialUrl).toContain("camara.leg.br");
  });

  it("creates a deterministic movement id", () => {
    const raw = movementFixture.dados[0];
    expect(mapCamaraMovement(raw, "2347064", checkedAt).externalId)
      .toBe(mapCamaraMovement(raw, "2347064", checkedAt).externalId);
  });
});
```

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -- tests/integrations/camara/mapper.test.ts`

Expected: FAIL because the mapper does not exist.

- [ ] **Step 4: Implement pure Câmara mappers**

Use Zod at the raw boundary and canonical schemas at the return boundary. Parse Câmara local dates as `America/Sao_Paulo` before converting to ISO. Build IDs for movements from proposition id, sequence, date/time and organ code; build vote IDs from the official vote id. Map unfamiliar vote labels to `choice: "outro"` while preserving `rawChoice`.

Required mapper signatures:

```ts
export function mapCamaraBill(raw: unknown, checkedAt: Date): Bill;
export function mapCamaraAuthor(raw: unknown, billId: string, checkedAt: Date): BillAuthor;
export function mapCamaraTopic(raw: unknown, billId: string, checkedAt: Date): BillTopic;
export function mapCamaraMovement(raw: unknown, billId: string, checkedAt: Date): Movement;
export function mapCamaraVoteEvent(raw: unknown, billId: string, checkedAt: Date): VoteEvent;
export function mapCamaraIndividualVote(raw: unknown, voteId: string, checkedAt: Date): IndividualVote;
```

- [ ] **Step 5: Implement the paginated Câmara client**

Create `CamaraAdapter` with `source = "camara"`. Use the official `links` collection for pagination rather than constructing page numbers. `listBillsChangedSince` queries `/proposicoes` in bounded one-day windows with `dataInicio`, `dataFim`, `ordem=ASC` and `ordenarPor=id`; `getBill` loads `/proposicoes/{id}`. Authors, topics and the remaining methods call the exact collection routes listed in Step 1.

All requests send `Accept: application/json`. Validate `dados` before mapping; a contract mismatch raises `OfficialSourceError` and must not produce partial canonical records.

- [ ] **Step 6: Implement the annual CSV bootstrap**

Create `streamCamaraBillArchive(since, until)` as an async iterable. For each calendar year touched by the interval, stream the official `proposicoes-{year}.csv` archive through `csv-parse`; do not load the whole file into memory. Validate and map each row to the same canonical `Bill` contract used by the API mapper, then discard rows outside the exact rolling cutoff. The bootstrap stores summary records only. Authors, topics, movements and votes are loaded from the API when a bill is opened, followed or changed after the checkpoint.

Tests use the small local CSV fixture and assert inclusion at both date boundaries, exclusion before the cutoff, UTF-8 text preservation and bounded streaming. No automated test downloads the official archive.

- [ ] **Step 7: Verify and commit the Câmara adapter**

Run: `npm test -- tests/integrations/camara/mapper.test.ts && npx tsc --noEmit`

Expected: mapper tests pass and the adapter conforms to `LegislativeSourceAdapter`.

```bash
git add src/integrations/camara tests/integrations/camara tests/fixtures/camara
git commit -m "feat: ingest Câmara legislative data"
```

---

### Task 5: Senado Adapter

**Files:**
- Create: `src/integrations/senado/client.ts`
- Create: `src/integrations/senado/mapper.ts`
- Create: `tests/fixtures/senado/pesquisa-materias.xml`
- Create: `tests/fixtures/senado/materia.xml`
- Create: `tests/fixtures/senado/autoria.xml`
- Create: `tests/fixtures/senado/assuntos.xml`
- Create: `tests/fixtures/senado/movimentacoes.xml`
- Create: `tests/fixtures/senado/votacoes.xml`
- Create: `tests/fixtures/senado/senadores.xml`
- Test: `tests/integrations/senado/mapper.test.ts`

**Interfaces:**
- Consumes: `retryingFetch`, `fast-xml-parser` and the canonical contracts from Task 2.
- Produces: `SenadoAdapter implements LegislativeSourceAdapter`, plus pure mappers matching the Câmara mapper return types.

- [ ] **Step 1: Capture and document Senado contracts**

Use the official catalog links to capture one representative response for matter search, detail, movement, vote and current senator list. The expected service route families are:

```text
/materia/pesquisa/lista
/materia/{codigoMateria}
/materia/movimentacoes/{codigoMateria}
/materia/votacoes/{codigoMateria}
/senador/lista/atual
/senador/{codigoParlamentar}/votacoes
```

Before saving fixtures, confirm each route from the current Senado Dados Abertos catalog. Save the raw XML without reformatting under `tests/fixtures/senado/` and add a neighboring `tests/fixtures/senado/README.md` containing the confirmed URL and capture date for every file.

- [ ] **Step 2: Write failing XML mapper tests**

Create `tests/integrations/senado/mapper.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSenadoXml, mapSenadoBill } from "#/integrations/senado/mapper";

const xml = readFileSync("tests/fixtures/senado/materia.xml", "utf8");

describe("Senado mapper", () => {
  it("normalizes a matter while preserving its official identity", () => {
    const raw = parseSenadoXml(xml);
    const bill = mapSenadoBill(raw, new Date("2026-09-03T18:00:00.000Z"));
    expect(bill.source).toBe("senado");
    expect(bill.originHouse).toBe("senado");
    expect(bill.officialCode).toMatch(/^[A-Z]+ \d+\/\d{4}$/);
    expect(bill.officialUrl).toContain("senado.leg.br");
  });
});
```

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -- tests/integrations/senado/mapper.test.ts`

Expected: FAIL because the Senado mapper does not exist.

- [ ] **Step 4: Implement defensive XML normalization**

Configure `XMLParser` with `ignoreAttributes: false`, `parseTagValue: false`, `trimValues: true` and `isArray` for collections that may contain one or many records. Convert empty elements to `null`, but preserve official text exactly after trimming surrounding whitespace.

Export:

```ts
export function parseSenadoXml(xml: string): unknown;
export function mapSenadoBill(raw: unknown, checkedAt: Date): Bill;
export function mapSenadoAuthor(raw: unknown, billId: string, checkedAt: Date): BillAuthor;
export function mapSenadoTopic(raw: unknown, billId: string, checkedAt: Date): BillTopic;
export function mapSenadoMovement(raw: unknown, billId: string, sequence: number, checkedAt: Date): Movement;
export function mapSenadoVoteEvent(raw: unknown, billId: string, checkedAt: Date): VoteEvent;
export function mapSenadoIndividualVote(raw: unknown, voteId: string, checkedAt: Date): IndividualVote;
export function mapSenadoLawmaker(raw: unknown, checkedAt: Date): Lawmaker;
```

Validate parsed shapes with Zod and return canonical records through the Task 2 schemas. Detect secrecy and nominal availability from official indicators; never synthesize an individual vote when the official collection is absent.

- [ ] **Step 5: Implement the Senado client**

Create `SenadoAdapter` with `source = "senado"`. The adapter sends `Accept: application/xml`, encodes all search parameters with `URLSearchParams`, follows catalog-supported pagination, and maps every response through Step 4. `getBill` loads `/materia/{codigoMateria}`. Bound matter searches to one-day ranges so a retry does not request an unbounded historical collection.

If the confirmed catalog differs from a route family in Step 1, use the catalog URL and record it in the fixture README; the adapter tests remain based on the confirmed official response.

- [ ] **Step 6: Verify and commit the Senado adapter**

Run: `npm test -- tests/integrations/senado/mapper.test.ts && npx tsc --noEmit`

Expected: mapper tests pass and `SenadoAdapter` conforms to `LegislativeSourceAdapter`.

```bash
git add src/integrations/senado tests/integrations/senado tests/fixtures/senado
git commit -m "feat: ingest Senado legislative data"
```

---

### Task 6: Idempotent Persistence Repositories

**Files:**
- Create: `src/server/db/repositories.ts`
- Create: `tests/setup-database.ts`
- Modify: `vitest.config.ts`
- Test: `tests/server/db/repositories.test.ts`

**Interfaces:**
- Consumes: canonical records and Drizzle tables.
- Produces: `LegislativeRepository` methods `upsertBillGraph`, `upsertLawmakers`, `getCheckpoint`, `saveCheckpoint`, `markSourceSuccess` and `markSourceFailure`.

- [ ] **Step 1: Write failing idempotency tests**

Use the dedicated PostgreSQL test database configured in Vitest. Add `setupFiles: ["./tests/setup-database.ts"]` to `vitest.config.ts`, then create this setup module:

```ts
import { afterAll, beforeAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const testSql = postgres(process.env.DATABASE_URL!, { max: 1 });
const testDb = drizzle(testSql);

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "drizzle" });
});

afterAll(async () => {
  await testSql.end();
});
```

Truncate the legislative tables in `beforeEach` inside the repository test. Write tests that call the same upsert twice and assert one bill/movement/vote row, then call it with a changed status and assert that the existing row was updated while `createdAt` stayed unchanged.

Core behavior:

```ts
await repository.upsertBillGraph({ bill, authors: [], topics: [], movements: [movement], voteEvents: [], individualVotes: [] });
await repository.upsertBillGraph({ bill, authors: [], topics: [], movements: [movement], voteEvents: [], individualVotes: [] });
expect(await db.select({ id: bills.id }).from(bills)).toHaveLength(1);
expect(await db.select({ id: movements.id }).from(movements)).toHaveLength(1);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/server/db/repositories.test.ts`

Expected: FAIL because `LegislativeRepository` does not exist.

- [ ] **Step 3: Implement transactional upserts**

Implement:

```ts
export interface BillGraph {
  bill: Bill;
  authors: BillAuthor[];
  topics: BillTopic[];
  movements: Movement[];
  voteEvents: VoteEvent[];
  individualVotes: IndividualVote[];
}

export class LegislativeRepository {
  private readonly database: typeof db;

  constructor(database: typeof db) {
    this.database = database;
  }
  upsertBillGraph(graph: BillGraph): Promise<void>;
  upsertLawmakers(items: Lawmaker[]): Promise<void>;
  getCheckpoint(source: LegislativeSourceName): Promise<Date | null>;
  saveCheckpoint(source: LegislativeSourceName, value: Date): Promise<void>;
  markSourceSuccess(source: LegislativeSourceName, checkedAt: Date): Promise<void>;
  markSourceFailure(source: LegislativeSourceName, checkedAt: Date, errorCode: string): Promise<void>;
}
```

Resolve canonical `(source, externalId)` references to internal UUIDs inside one transaction. Use `onConflictDoUpdate` for official values and `checkedAt`. Never delete a child merely because it is absent from one response. Store only a bounded error code such as `HTTP_503`, `TIMEOUT` or `CONTRACT_MISMATCH`; do not persist response bodies.

- [ ] **Step 4: Verify and commit persistence**

Run: `npm test -- tests/server/db/repositories.test.ts && npx tsc --noEmit`

Expected: idempotency, update and rollback tests pass.

```bash
git add src/server/db/repositories.ts tests/server/db tests/setup-database.ts vitest.config.ts
git commit -m "feat: persist legislative records idempotently"
```

---

### Task 7: Incremental Sync Orchestrator

**Files:**
- Create: `src/jobs/sync-source.ts`
- Create: `scripts/sync.ts`
- Test: `tests/jobs/sync-source.test.ts`

**Interfaces:**
- Consumes: `LegislativeSourceAdapter` and `LegislativeRepository`.
- Produces: `syncSource(adapter, repository, now, options): Promise<SyncReport>`, `hydrateBill(adapter, repository, billExternalId, now): Promise<void>` and CLI `npm run sync -- --source=all`.

- [ ] **Step 1: Write failing checkpoint and failure tests**

Create in-memory fakes for the adapter and repository. Assert that a successful multi-page run advances the checkpoint to `now`, while an adapter failure records source failure and leaves the previous checkpoint untouched. When no checkpoint exists, assert that the Câmara bootstrap receives exactly 36 months before `now`; for sources without a bulk bootstrap, assert that `listBillsChangedSince` receives that cutoff. In both cases movement/vote methods are not called. Test `hydrateBill` separately and assert that it fetches and persists the complete graph.

```ts
const report = await syncSource(
  adapter,
  repository,
  new Date("2026-09-03T18:00:00Z"),
  { initialHistoryMonths: 36 },
);
expect(report).toMatchObject({ source: "camara", bills: 2, failed: false });
expect(repository.savedCheckpoint?.toISOString()).toBe("2026-09-03T18:00:00.000Z");
expect(adapter.receivedSince?.toISOString()).toBe("2023-09-03T18:00:00.000Z");
expect(adapter.movementCalls).toBe(0);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/jobs/sync-source.test.ts`

Expected: FAIL because `syncSource` does not exist.

- [ ] **Step 3: Implement checkpoint-safe orchestration**

Export:

```ts
export interface SyncReport {
  source: "camara" | "senado";
  bills: number;
  authors: number;
  topics: number;
  movements: number;
  voteEvents: number;
  individualVotes: number;
  lawmakers: number;
  failed: boolean;
  startedAt: string;
  finishedAt: string;
}

export async function syncSource(
  adapter: LegislativeSourceAdapter,
  repository: LegislativeRepository,
  now: Date,
  options: { initialHistoryMonths: number },
): Promise<SyncReport>;

export async function hydrateBill(
  adapter: LegislativeSourceAdapter,
  repository: LegislativeRepository,
  billExternalId: string,
  now: Date,
): Promise<void>;
```

When no checkpoint exists, calculate the cutoff with Node.js 26 `Temporal`, preserving UTC calendar semantics:

```ts
const cutoff = Temporal.Instant.from(now.toISOString())
  .toZonedDateTimeISO("UTC")
  .subtract({ months: options.initialHistoryMonths })
  .toInstant();
const since = new Date(cutoff.epochMilliseconds);
```

This initial pass uses the Câmara annual CSV archives when available and stores bill summaries only; it does not preload authors, topics or timelines. Other sources may fall back to the paginated API for the same rolling cutoff. With an existing checkpoint, subtract five minutes as an overlap window and fully hydrate only bills changed in that interval. `hydrateBill` calls `getBill`, authors, topics, movements and vote events, then fetches individual votes only when an event is nominal and not secret.

Persist each graph independently so an interruption can safely retry. Sync active lawmakers before authorship and vote relationships. Save `now` as the checkpoint only after every page completes. On failure, call `markSourceFailure` and return `failed: true` without throwing from the CLI boundary.

- [ ] **Step 4: Add the cron-compatible CLI**

Create `scripts/sync.ts` that accepts only `--source=camara`, `--source=senado` or `--source=all`, instantiates adapters and repository, passes `env.INITIAL_HISTORY_MONTHS` to `syncSource`, runs sources sequentially to respect upstream services, emits one JSON `SyncReport` per source to stdout, closes PostgreSQL in `finally`, and sets `process.exitCode = 1` if any report failed.

Example invocation:

```bash
npm run sync -- --source=all
```

Expected: two JSON lines, one for each source, with no official response bodies in logs.

- [ ] **Step 5: Verify and commit incremental sync**

Run: `npm test -- tests/jobs/sync-source.test.ts && npx tsc --noEmit`

Expected: pagination, overlap, failure and checkpoint tests pass.

```bash
git add src/jobs scripts tests/jobs
git commit -m "feat: synchronize legislative sources incrementally"
```

---

### Task 8: Daily Reconciliation and Source Health

**Files:**
- Create: `src/jobs/reconcile.ts`
- Create: `scripts/reconcile.ts`
- Create: `app/api/health/route.ts`
- Test: `tests/jobs/reconcile.test.ts`
- Test: `tests/app/api/health/route.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: adapters, repository and `sourceHealth` records.
- Produces: `reconcileSource`, `GET /api/health` and `npm run reconcile -- --source=all`.

- [ ] **Step 1: Write failing non-destructive reconciliation test**

Test that reconciliation refreshes records returned upstream but does not delete a local bill omitted from a bounded source response. Assert that the job marks the source successful only after the full window completes.

- [ ] **Step 2: Write failing health-route test**

Inject a health reader returning one fresh source and one stale source. Expect HTTP `200` with `status: "degraded"`, source timestamps, and no internal error detail. Expect `status: "ok"` only when both sources succeeded within the last 90 minutes.

Expected response shape:

```json
{
  "status": "degraded",
  "sources": {
    "camara": { "available": true, "lastSuccessAt": "2026-09-03T18:00:00.000Z" },
    "senado": { "available": false, "lastSuccessAt": "2026-09-03T14:00:00.000Z" }
  }
}
```

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -- tests/jobs/reconcile.test.ts tests/app/api/health/route.test.ts`

Expected: FAIL because reconciliation and health modules do not exist.

- [ ] **Step 4: Implement bounded daily reconciliation**

Implement `reconcileSource(adapter, repository, { from, to })` using UTC day boundaries and the same idempotent graph persistence as incremental sync. Process one day at a time, oldest first. Do not delete omissions. Return counts and mark the source healthy only after the final window succeeds.

Add to `package.json`:

```json
"reconcile": "node scripts/reconcile.ts"
```

Create `scripts/reconcile.ts`. Accept only `--source=camara`, `--source=senado` or `--source=all`; reject any other value with exit code 2 and a one-line usage message. Instantiate the selected adapters and repository, calculate the previous UTC day as the closed reconciliation window, run sources sequentially, print one JSON report per source, close PostgreSQL in `finally`, and set `process.exitCode = 1` when any source fails.

- [ ] **Step 5: Implement the health route**

Create `app/api/health/route.ts` with a `GET` handler. Read source health through a small exported `readSourceHealth()` function, consider a source available when its last success is no older than 90 minutes, and return `200` for both `ok` and `degraded`. Reserve `500` for failure to query the local database. Do not expose connection strings, stack traces or upstream error bodies.

- [ ] **Step 6: Run the complete verification suite**

Run:

```bash
npm test
npx tsc --noEmit
npm run build
docker compose up -d postgres
npm run db:migrate
npm run sync -- --source=camara
npm run sync -- --source=senado
```

Then run `npm start` in one terminal and `curl --fail http://localhost:3000/api/health` in another.

Expected: automated tests, typecheck and build pass; both sync commands emit successful reports against official sources; the health route reports both sources with timestamps. If an official source is temporarily unavailable, retain the automated fixture results and record the live smoke test as degraded instead of modifying the adapter to accept invalid data.

- [ ] **Step 7: Commit the completed data core**

```bash
git add app/api/health src/jobs scripts/reconcile.ts tests/jobs tests/app package.json package-lock.json
git commit -m "feat: reconcile data and expose source health"
```

## Operations Schedule

Configure the hosting scheduler after deployment:

```text
*/30 * * * * npm run sync -- --source=all
17 3 * * * npm run reconcile -- --source=all
```

Both schedules use `America/Sao_Paulo`. Prevent overlapping executions with a PostgreSQL advisory lock keyed by job name; if the lock is held, exit successfully with `{ "skipped": "already_running" }`.

## Completion Gate

The plan is complete only when:

- all fixture-based tests pass without network access;
- live smoke tests accept current official Câmara and Senado contracts;
- running the same sync twice creates no duplicate rows;
- a failed source leaves its previous checkpoint and records intact;
- every persisted record contains source, external identifier, official URL and verification timestamp;
- `/api/health` distinguishes fresh and stale sources without leaking internal errors.
