# Plano de implementação dos módulos restantes

> Execução aprovada pelo usuário em 3 de setembro de 2026. Cada tarefa segue ciclo teste vermelho, implementação mínima, verificação e commit.

**Objetivo:** entregar a experiência pública completa, resumos curtos por IA, contas opcionais, itens seguidos e alertas sobre o núcleo legislativo existente.

**Arquitetura:** modelos de leitura isolam SQL da interface; páginas são Server Components e ilhas interativas cuidam de preferências e autenticação; geração por IA e entrega push são adaptadores opcionais; alertas persistidos são o canal confiável.

**Stack:** Node.js 26, Next.js 16, React 19, TypeScript 7, PostgreSQL 18, Drizzle ORM, Vitest e Testing Library.

---

## Tarefa 1: modelos de leitura públicos

**Arquivos:**
- Criar: `src/server/public/read-models.ts`
- Criar: `src/server/public/queries.ts`
- Criar: `tests/server/public/queries.test.ts`
- Modificar: `src/server/db/schema.ts`
- Criar: nova migração Drizzle

1. Escrever testes de integração para feed paginado, busca, filtros por fonte/situação/tema/partido/autor e ordenação.
2. Escrever testes para detalhe completo de projeto e de parlamentar, incluindo votos indisponíveis.
3. Executar o arquivo e confirmar falha pela ausência das consultas.
4. Implementar consultas agregadas e índices de leitura sem alterar dados oficiais.
5. Executar testes, tipo e migração no banco de teste.
6. Commit: `feat: add public legislative read models`.

## Tarefa 2: sistema visual e shell responsivo

**Arquivos:**
- Criar: `app/globals.css`
- Criar: `src/ui/site-header.tsx`
- Criar: `src/ui/source-badge.tsx`
- Criar: `src/ui/status-rail.tsx`
- Criar: `src/ui/icons.tsx`
- Modificar: `app/layout.tsx`
- Criar: `tests/ui/components.test.tsx`

1. Configurar ambiente DOM e escrever testes de rótulos, links, landmarks e estados sem cor.
2. Confirmar falha.
3. Implementar tokens, tipografia, shell, navegação, distintivos e trilho de estado.
4. Validar foco, redução de movimento e pontos de quebra.
5. Commit: `feat: establish civic visual system`.

## Tarefa 3: feed, busca e filtros

**Arquivos:**
- Modificar: `app/page.tsx`
- Criar: `src/ui/project-card.tsx`
- Criar: `src/ui/feed-filters.tsx`
- Criar: `src/ui/pagination.tsx`
- Criar: `app/loading.tsx`
- Criar: `app/error.tsx`
- Criar: `tests/app/feed.test.tsx`

1. Testar parsing seguro dos parâmetros, conteúdo oficial, marcação de IA, filtros e paginação.
2. Implementar feed renderizado no servidor e formulário GET acessível.
3. Implementar estados vazio/erro/carregamento.
4. Validar consultas reais no banco local.
5. Commit: `feat: build searchable legislative feed`.

## Tarefa 4: página do projeto

**Arquivos:**
- Criar: `app/projetos/[source]/[externalId]/page.tsx`
- Criar: `src/ui/project-timeline.tsx`
- Criar: `src/ui/vote-event.tsx`
- Criar: `src/ui/official-facts.tsx`
- Criar: `tests/app/project-detail.test.tsx`

1. Testar projeto existente, identificador inválido, trilho real, votos nominais e links oficiais.
2. Implementar metadados, cabeçalho de estado, bloco de IA, fatos oficiais, autores, temas, linha do tempo e votações.
3. Implementar navegação para parlamentares e resposta 404 segura.
4. Commit: `feat: add bill timeline and voting detail`.

## Tarefa 5: página do parlamentar

**Arquivos:**
- Criar: `app/parlamentares/[source]/[externalId]/page.tsx`
- Criar: `src/ui/lawmaker-profile.tsx`
- Criar: `src/ui/lawmaker-vote.tsx`
- Criar: `tests/app/lawmaker-detail.test.tsx`

1. Testar identidade, proposições associadas, atividade e votos recentes.
2. Implementar perfil neutro, foto com fallback e cartões de voto ligados ao projeto e à fonte.
3. Garantir que nenhum ranking ou inferência seja exibido.
4. Commit: `feat: add neutral lawmaker profiles`.

## Tarefa 6: persistência e geração opcional por IA

**Arquivos:**
- Modificar: `src/server/db/schema.ts`
- Criar: nova migração Drizzle
- Criar: `src/ai/summary.ts`
- Criar: `src/ai/openai-provider.ts`
- Criar: `src/jobs/generate-summaries.ts`
- Criar: `scripts/generate-summaries.ts`
- Modificar: `src/server/config.ts`
- Modificar: `package.json`
- Criar: `.env.example`
- Criar: `tests/ai/summary.test.ts`
- Criar: `tests/jobs/generate-summaries.test.ts`

1. Testar impressão digital, limites, validação, neutralidade básica, idempotência e fallback.
2. Adicionar `ai_summaries` e repositório.
3. Implementar contrato do provedor e adaptador OpenAI somente quando chave e modelo existirem.
4. Implementar job em lotes que não bloqueia a ingestão nem substitui fatos oficiais.
5. Integrar os dois campos aos modelos públicos com marca visual explícita.
6. Commit: `feat: generate transparent plain-language summaries`.

## Tarefa 7: autenticação opcional

**Arquivos:**
- Modificar: `src/server/db/schema.ts`
- Criar: nova migração Drizzle
- Criar: `src/auth/password.ts`
- Criar: `src/auth/session.ts`
- Criar: `src/auth/user-repository.ts`
- Criar: `app/api/auth/register/route.ts`
- Criar: `app/api/auth/login/route.ts`
- Criar: `app/api/auth/logout/route.ts`
- Criar: `app/entrar/page.tsx`
- Criar: `app/cadastro/page.tsx`
- Criar: `tests/auth/auth.test.ts`
- Criar: `tests/app/api/auth.test.ts`

1. Testar normalização, `scrypt`, comparação em tempo constante, criação/revogação/expiração de sessão e respostas sem vazamento de conta.
2. Adicionar usuários e sessões; armazenar apenas hash do token.
3. Implementar rotas e formulários com cookie seguro e redirecionamento interno validado.
4. Commit: `feat: add optional account sessions`.

## Tarefa 8: seguir localmente e sincronizar com a conta

**Arquivos:**
- Modificar: `src/server/db/schema.ts`
- Criar: nova migração Drizzle
- Criar: `src/follows/follow-repository.ts`
- Criar: `app/api/follows/route.ts`
- Criar: `src/ui/follow-button.tsx`
- Criar: `app/seguindo/page.tsx`
- Criar: `tests/follows/follows.test.ts`
- Criar: `tests/ui/follow-button.test.tsx`

1. Testar seguir/deixar de seguir no armazenamento local e união idempotente após login.
2. Adicionar tabelas separadas de projetos e parlamentares seguidos com unicidade por conta.
3. Implementar botão cliente e API autenticada com validação de origem/referência.
4. Implementar página “Seguindo” para visitante e conta.
5. Commit: `feat: preserve followed items across sign in`.

## Tarefa 9: eventos e caixa de alertas

**Arquivos:**
- Modificar: `src/server/db/schema.ts`
- Criar: nova migração Drizzle
- Criar: `src/alerts/detect-events.ts`
- Criar: `src/alerts/alert-repository.ts`
- Modificar: `src/server/db/repositories.ts`
- Criar: `app/api/alerts/route.ts`
- Criar: `app/alertas/page.tsx`
- Criar: `tests/alerts/detect-events.test.ts`
- Criar: `tests/alerts/alert-repository.test.ts`

1. Testar classificação conservadora dos seis tipos aprovados e rejeição de movimentos administrativos.
2. Testar deduplicação por evento e entrega somente a seguidores do projeto.
3. Persistir mudanças dentro da atualização do grafo sem emitir alertas em falha parcial.
4. Implementar caixa com leitura e contador.
5. Commit: `feat: deliver deduplicated in-app alerts`.

## Tarefa 10: Web Push progressivo e PWA

**Arquivos:**
- Modificar: `src/server/db/schema.ts`
- Criar: nova migração Drizzle
- Criar: `src/alerts/push-provider.ts`
- Criar: `app/api/push/subscriptions/route.ts`
- Criar: `src/ui/push-opt-in.tsx`
- Criar: `public/sw.js`
- Criar: `app/manifest.ts`
- Criar: `tests/alerts/push-provider.test.ts`

1. Testar que a ausência de VAPID mantém caixa interna funcional e retorna capacidade desabilitada.
2. Implementar inscrições e entrega com falha isolada; remover inscrições expiradas.
3. Implementar service worker mínimo e solicitação de permissão apenas após ação explícita.
4. Commit: `feat: add progressive web notifications`.

## Tarefa 11: revisão, desempenho e validação final

**Arquivos:**
- Modificar conforme problemas encontrados.
- Criar: `docs/validation/2026-09-03-mvp-validation.md`

1. Executar migrações nos bancos de teste e desenvolvimento.
2. Executar todos os testes, typecheck e build do zero.
3. Revisar o diff completo: correção, neutralidade, limites de IA, segurança de sessão e integridade de alertas.
4. Iniciar o app com dados reais e validar manualmente no navegador desktop e celular: feed, cinco filtros, projeto, parlamentar, seguir anônimo, cadastro, migração, alerta e saída.
5. Validar teclado, foco, contraste, ausência de overflow e console/erros de rede.
6. Registrar evidências, limitações dependentes de chave e comandos de operação.
7. Commit: `test: validate complete legislative mvp`.

