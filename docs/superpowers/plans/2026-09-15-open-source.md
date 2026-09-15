# Open Source Readiness Implementation Plan

> **For agentic workers:** Use inline execution with review checkpoints. Steps use checkbox syntax for tracking.

**Goal:** Publicar o Pulso Público no GitHub como um MVP open source sob licença MIT, sem credenciais ou dados operacionais.

**Architecture:** Preservar Next.js, as camadas existentes e as migrações. Acrescentar documentação pública, CI e um seed fictício protegido; validar o pacote publicável numa cópia limpa com PostgreSQL isolado.

**Tech Stack:** Node 22.23.2, npm 11.19.0, Next.js 16.3.4, TypeScript, tsx 4.23.13, Vitest, Drizzle, PostgreSQL 18, GitHub Actions e Gitleaks 8.30.1.

**Spec:** Plano de seis frentes apresentado na conversa e aprovado pelo usuário em 2026-09-15, com escolha explícita de MIT.

## Global Constraints

- Licença MIT, copyright 2026 Italo José.
- Não tocar nas três alterações preexistentes de filtros e respectivos testes.
- Nenhuma conexão, sincronização ou migração no banco de produção.
- Dados fictícios identificados como demonstração, sem pessoas reais e sem chamar IA.
- Testes somente em PostgreSQL de loopback `_test` e regressão da demo em `_test_demo`, ambos descartáveis; seed interativo somente em loopback com nome terminado em `_demo`.
- Workflows de PR sem segredos e com permissões mínimas; actions fixadas por SHA.
- Preservar histórico Git se a revisão não encontrar segredos; não reescrevê-lo silenciosamente.

## Task 1: Segurança de desenvolvimento e demonstração

**Files:** `tests/development/database-url.test.ts`, `tests/development/seed-demo.test.ts`, `src/development/database-url.ts`, `src/development/seed-demo.ts`, `scripts/seed-demo.ts`, `tests/setup-database.ts`, `vitest.config.ts`, `.env.example`, `docker-compose.yml`, `docker/postgres/init-test-db.sql`.

**Interfaces:** `assertLocalDisposableDatabaseUrl(value, purpose)` protege conexões; `seedDemo(database)` acrescenta registros idempotentes fictícios. O CLI exige `DEMO_DATABASE_URL` explicitamente e não carrega `.env`.

- [x] Escrever testes que aceitem loopback e nomes corretos, rejeitem bancos comuns/remotos e não incluam credenciais nas mensagens.
- [x] Executar `npm test -- tests/development/database-url.test.ts` e confirmar falha antes de implementar a proteção.
- [x] Implementar a proteção e aplicá-la no runner e no setup de integração.
- [x] Escrever teste de seed verificando visibilidade no feed e idempotência com banco de testes isolado.
- [x] Executar o teste e confirmar falha antes de implementar o seed.
- [x] Implementar seed e CLI sem apagar dados, sem usuários predefinidos e sem acesso à rede.
- [x] Alinhar `.env.example` ao banco `legislativo` na porta 5435 e criar `legislativo_demo` pelo init do Docker.
- [x] Executar testes novos e suite completa em PostgreSQL descartável.

**Ruling:** Comandos TypeScript agora usam tsx fixado, porque o Node 22 rejeita nativamente o namespace `#/`. Reproduzido pelo CLI e coberto por regressão; preservar aliases existentes evita uma reescrita de todo o app e de arquivos com alterações preexistentes.

**Ruling:** Não executar `npm audit fix --force`: a única recomendação automática é um downgrade incompatível do Drizzle Kit. Os quatro alertas moderados herdados ficam documentados como toolchain de desenvolvimento; auditoria das dependências de produção retorna zero.

**Ruling:** A revisão final separou a regressão offline num terceiro banco descartável `_test_demo`, evitando alterações na demo de exploração. A proteção exige o sufixo mais específico, Docker/CI criam o banco e os guias explicam os dois overrides de testes. Regressão, suite de 773 testes, tipos e build aprovados após a correção.

## Task 2: Licença, comunidade e documentação

**Files:** `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `ROADMAP.md`, `CHANGELOG.md`, `README.md`, `docs/architecture.md`, `docs/data-and-ai.md`, `docs/development.md`, `docs/deployment.md`, `docs/third-party-notices.md`, `package.json`, `package-lock.json`.

**Interfaces:** README é a entrada; os guias detalham arquitetura, fontes e execução. `private: true` continua impedindo publicação acidental no npm, sem restringir GitHub ou MIT.

- [x] Adicionar MIT e metadados do repositório, preservando os comandos existentes.
- [x] Documentar clone, `nvm install`, `nvm use`, npm fixado, `npm ci`, Docker, migrações, demo e testes isolados.
- [x] Separar uso mínimo do app de cargas eleitorais e históricas opcionais e custosas.
- [x] Documentar neutralidade, rastreabilidade, IA opcional, dados pessoais e condições externas de uso.
- [x] Adicionar regras de contribuição, revisão, conduta e canal privado de segurança sem inventar email ou prazo de atendimento.
- [x] Registrar escopo MVP, limitações e roadmap sem prometer funcionalidades prontas.
- [x] Inventariar licenças instaladas, incluindo fontes, e documentar atribuições.
- [x] Capturar screenshot real do feed com dados fictícios e incluir no README.

## Task 3: Automação e organização do GitHub

**Files:** `.github/workflows/ci.yml`, `.github/workflows/secrets.yml`, `.github/dependabot.yml`, `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/feature.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, `.gitignore`.

**Interfaces:** Checks `quality` e `secret-scan` serão exigidos na proteção de `main`. CI usa PostgreSQL 18 exclusivo, sem credenciais reais ou APIs externas.

- [x] Configurar instalação npm fixada, checagem de tipos, testes e build em push e PR.
- [x] Configurar Gitleaks com binário de release e checksum, histórico completo e saída redigida.
- [x] Configurar Dependabot semanal para npm e actions, templates e ownership `@italojs`.
- [x] Ignorar variantes de `.env`, chaves, dumps, caches e scratch futuro; continuar versionando `.env.example`.
- [x] Validar YAML e contratos de setup na cópia limpa.

## Task 4: Revisão e publicação

**Files:** `docs/validation/2026-09-15-open-source-readiness.md` e somente arquivos desta preparação no commit.

**Interfaces:** Publicar `italojs/pulso-publico` com histórico revisado; ativar recursos de comunidade, canal privado de vulnerabilidades e proteção de `main` depois dos checks iniciais.

- [x] Gitleaks no histórico completo e no pacote publicável, com saída redigida.
- [x] `npm ci`, `npm test`, `npm run typecheck` e `npm run build` em cópia sem `.env` local, usando Node/npm fixados.
- [x] Migrar banco demo novo, executar seed duas vezes e conferir página HTTP e screenshot.
- [x] Revisão independente read-only; corrigir problemas relevantes e repetir verificações afetadas.
- [ ] Registrar evidências, commit seletivo, criar repositório público, push inicial e verificar CI real.
- [ ] Configurar proteção, alertas de dependências e private vulnerability reporting; conferir por API.
- [ ] Criar release `v0.1.0` como MVP e entregar links; relatar qualquer bloqueio externo sem fingir conclusão.
