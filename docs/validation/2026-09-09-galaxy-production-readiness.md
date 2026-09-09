# Galaxy production readiness — 2026-09-09

## Release candidate local

Validação encerrada em `2026-09-09T19:49:30Z` na branch `main`.

- Runtime: Node `v22.23.2`; npm `10.9.8` fornecido pelo runtime fixado.
- Testes: `TEST_DATABASE_URL=<local-test-database> npm test` — 69 arquivos e 749 testes aprovados, zero falhas.
- Tipos: `npm run typecheck` — aprovado.
- Build: `npm run build` — build Next.js 16.3.4 standalone aprovado.
- Integridade do patch: `git diff --check` — aprovado.
- O bundle contém `public/sw.js` e `.next/static` dentro de `.next/standalone`.

O primeiro smoke test revelou que `next start` não aceita `output: "standalone"`. O script de inicialização foi corrigido para `node .next/standalone/server.js`, e o build passou a copiar os ativos estáticos para o bundle. O teste de regressão `tests/deployment/runtime-config.test.ts` cobre esse contrato.

## Smoke test HTTP standalone

Processo iniciado com `HOSTNAME=127.0.0.1 PORT=3217 npm start` e encerrado por `SIGINT` após as verificações:

- `/api/health`: HTTP 200, JSON válido; estado local `degraded` por fontes sem sincronização recente.
- `/`: HTTP 200, HTML.
- `/candidatos`: HTTP 200, HTML.
- `/projetos/camara/2617687`: HTTP 200, HTML.
- `/sw.js`: HTTP 200, JavaScript.
- Nenhum valor de ambiente ou URL de conexão apareceu no log do processo.

## Banco e retomada do coletor

Um banco local isolado chamado `legislativo_release_gate` recebeu todas as migrações:

- `scripts/verify-production-database.ts`: 14 migrações e todas as nove tabelas obrigatórias presentes.
- O verificador identificou corretamente a role local como superusuária; a produção deverá retornar `superuser: false` para `pulse_app`.
- Primeira unidade: `--source=senado --from=2026 --through=2026 --once` persistiu um lote e criou sete tarefas.
- Antes da interrupção: fase `catalog`, 2.904 registros persistidos e cursor durável.
- Após interrupção, expiração controlada do lease e reinício com `--once`: 3.203 registros persistidos, `seededTasks: 0` e cursor avançado.
- Consulta de unicidade após a retomada: zero duplicatas para `(source, external_id)` em `bills`.
- Armazenamento no ensaio: cerca de 12 MB, nível `ok` diante da capacidade configurada de 30 GB.

Uma interrupção forçada que não entrega o sinal ao processo Node pode manter a tarefa como `running` até o lease de cinco minutos expirar. Isso é esperado; outro processo a recupera depois do vencimento sem perder o cursor confirmado.

## Pendências externas

- Criar/verificar `pulse_app` e o banco lógico `pulse` no Galaxy usando a credencial administrativa apenas em memória.
- Aplicar as migrações como `pulse_app` e confirmar `superuser: false`.
- Inspecionar no Galaxy o preço exato do menor Web App Production com um contêiner e obter confirmação do custo antes de criar o recurso.
- Publicar, validar manualmente o app ao vivo e iniciar o coletor histórico local persistente.
