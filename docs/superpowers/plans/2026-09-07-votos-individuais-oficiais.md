# Votos Individuais Oficiais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recuperar e exibir todos os votos individuais publicados oficialmente para as votações já conhecidas pelo aplicativo.

**Architecture:** A hidratação consulta votos de todo evento público com concorrência limitada. Um backfill separado percorre os arquivos anuais `votacoesVotos` da Câmara, persiste apenas registros vinculados a eventos locais e usa checkpoints anuais retomáveis.

**Tech Stack:** Node.js 26, TypeScript 7, Next.js 16, React 19, Drizzle ORM, PostgreSQL, Vitest, `csv-parse`.

**Spec:** `docs/superpowers/specs/2026-09-07-votos-individuais-oficiais-design.md`

## Global Constraints

- Trabalhar diretamente na `main`, conforme autorização explícita do usuário.
- Preservar a alteração preexistente em `tests/server/public/queries.test.ts`.
- Nunca inferir voto individual a partir de presença ou orientação partidária.
- Importar o histórico local desde 2019 até o ano corrente.
- Manter chamadas incrementais à Câmara com concorrência máxima de oito eventos.

---

### Task 1: Descoberta incremental de votos

**Files:**
- Modify: `src/server/legislative/persist-bill-graph.ts`
- Test: `tests/jobs/sync-source.test.ts`

**Interfaces:**
- Consumes: `LegislativeSourceAdapter.listIndividualVotes(voteEventExternalId)`.
- Produces: `loadBillGraph()` que consulta todo evento público, inclusive o inicialmente marcado como não nominal.

- [x] **Step 1: Write the failing test**

Adicionar um evento público `isNominal: false` ao adaptador falso e verificar que `loadBillGraph` consulta e retorna seu voto individual.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/jobs/sync-source.test.ts`
Expected: FAIL porque o evento não nominal ainda é filtrado antes da consulta.

- [x] **Step 3: Write minimal implementation**

Trocar o filtro por todos os eventos não secretos e executar as consultas em lotes de no máximo oito, preservando a ordem dos resultados.

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/jobs/sync-source.test.ts`
Expected: PASS.

### Task 2: Arquivo anual de votos da Câmara

**Files:**
- Modify: `src/domain/legislative.ts`
- Modify: `src/integrations/camara/bootstrap.ts`
- Modify: `src/integrations/camara/client.ts`
- Test: `tests/integrations/camara/bootstrap.test.ts`

**Interfaces:**
- Produces: `ArchivedIndividualVote` e `LegislativeVoteArchiveBootstrap.streamHistoricalIndividualVotes(since, until)`.
- Produces: `streamCamaraIndividualVoteArchive()` que lê `votacoesVotos-AAAA.csv` e entrega voto mais referência oficial do deputado.

- [x] **Step 1: Write the failing test**

Fornecer CSV literal com dois anos, um voto dentro e outro fora do intervalo, e esperar somente o registro dentro da janela com escolha, votação e deputado normalizados.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integrations/camara/bootstrap.test.ts`
Expected: FAIL porque o stream de votos ainda não existe.

- [x] **Step 3: Write minimal implementation**

Adicionar os tipos de domínio, mapear as colunas oficiais e expor o stream pelo `CamaraAdapter`, usando a mesma política de download e validação dos demais arquivos anuais.

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integrations/camara/bootstrap.test.ts`
Expected: PASS.

### Task 3: Persistência e backfill retomável

**Files:**
- Modify: `src/server/db/repositories.ts`
- Create: `src/jobs/backfill-camara-votes.ts`
- Create: `scripts/backfill-camara-votes.ts`
- Modify: `package.json`
- Test: `tests/server/db/repositories.test.ts`
- Create: `tests/jobs/backfill-camara-votes.test.ts`

**Interfaces:**
- Produces: `LegislativeRepository.upsertArchivedIndividualVotes(items)` com retorno da quantidade persistida.
- Produces: `backfillCamaraVotes(adapter, repository, options)` com checkpoints `individual_votes` por ano.
- Produces: comando `npm run backfill:votes -- --from=2019`.

- [x] **Step 1: Write failing repository and job tests**

Verificar que apenas votos com evento local são inseridos, que um deputado ativo não é rebaixado, que lotes são limitados e que um ano concluído é pulado sem `--refresh`.

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/server/db/repositories.test.ts tests/jobs/backfill-camara-votes.test.ts`
Expected: FAIL porque método e job ainda não existem.

- [x] **Step 3: Write minimal implementation**

Persistir referências de deputados e votos dentro de transação, relacionar por `vote_events.external_id`, processar o stream em lotes de 500 e registrar contadores/checkpoints anuais.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/server/db/repositories.test.ts tests/jobs/backfill-camara-votes.test.ts`
Expected: PASS.

### Task 4: Mensagem e exibição corretas

**Files:**
- Modify: `src/ui/vote-event.tsx`
- Test: `tests/ui/detail-components.test.tsx`

**Interfaces:**
- Consumes: `PublicVoteEvent.individualVotes`.
- Produces: cartão que prioriza votos existentes sobre a classificação textual e explica a ausência sem afirmar algo não comprovado.

- [x] **Step 1: Write failing UI tests**

Verificar que um evento `isNominal: false` com votos exibe a tabela e que um evento público vazio informa a ausência na fonte e a possibilidade de votação simbólica.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/detail-components.test.tsx`
Expected: FAIL porque a classificação textual ainda esconde a tabela.

- [x] **Step 3: Write minimal implementation**

Reordenar os estados do cartão: secreto, votos presentes, nominal vazio e público sem registros, com texto acessível em português.

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/detail-components.test.tsx`
Expected: PASS.

### Task 5: Backfill e validação final

**Files:**
- Modify: `docs/superpowers/validation/2026-09-07-votos-individuais-oficiais.md`

**Interfaces:**
- Consumes: comando `backfill:votes` e aplicação local.
- Produces: base local corrigida desde 2019 e evidências reprodutíveis.

- [x] **Step 1: Run focused and complete verification**

Run: `npm test`, `npm run typecheck`, `npm run build`.
Expected: todos com exit code 0.

- [x] **Step 2: Run the historical import**

Run: `npm run backfill:votes -- --from=2019`.
Expected: relatórios completos por ano e votos vinculados às votações existentes.

- [x] **Step 3: Validate the known regression**

Confirmar no banco e na página da PEC 221/2019 que a votação `2233802-401` possui 38 votos individuais e que eventos sem registros oficiais exibem a nova explicação.

- [x] **Step 4: Record evidence**

Documentar comandos, contagens e inspeção manual em `docs/superpowers/validation/2026-09-07-votos-individuais-oficiais.md`.
