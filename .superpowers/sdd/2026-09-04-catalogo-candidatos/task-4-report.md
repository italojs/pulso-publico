# Task 4 — sincronização eleitoral e CLIs

## Status

Implementada sobre a base `f6d63d3` e consolidada no commit de código `3b703e6` (`feat: synchronize TSE election data`). Nenhuma parte da Task 5 foi iniciada.

## Arquivos

- Configuração e operação: `src/server/config.ts`, `.env.example`, `package.json`, `README.md`.
- Orquestração: `src/jobs/sync-election.ts`.
- Reconciliação e contrato do comando administrativo: `src/jobs/reconcile-candidate-lawmakers.ts`.
- CLIs Node 26: `scripts/sync-election.ts`, `scripts/manage-candidate-link.ts`.
- Extensões produtoras mínimas autorizadas: `src/integrations/tse/client.ts`, `src/integrations/tse/media-store.ts`, `src/server/electoral/repository.ts`.
- Testes: `tests/jobs/sync-election.test.ts`, `tests/jobs/reconcile-candidate-lawmakers.test.ts`, `tests/server/config.test.ts`, `tests/integrations/tse/client.test.ts`, `tests/integrations/tse/media-store.test.ts`, `tests/server/electoral/repository.test.ts`.

## Decisões e comportamento entregue

- Execução restrita a 2026; outro ano termina antes de lock, mídia, rede ou banco com `UNSUPPORTED_ELECTION_YEAR`.
- O job recebe uma dependência estreita de advisory lock. A CLI de produção a conecta a `withAdvisoryLock(sql, "electoral-sync-2026", ...)`. Lock ocupado retorna `SYNC_ALREADY_RUNNING`; falha de aquisição retorna `SYNC_LOCK_FAILED`.
- Os seis recursos tabulares são consumidos por streaming. Linhas de candidatos e complementos são reduzidas imediatamente a allowlists públicas, sem reter CPF, e-mail, endereço ou processo.
- Complementos só se unem por `SQ_CANDIDATO`; duplicatas conflitantes falham. Coligações usam ano, turno, circunscrição/UF, cargo e partido; conflito inequívoco falha com `CONFLICTING_COALITION_MATCH`.
- O cliente expõe metadata controlada por entrada do ZIP: receitas, despesas contratadas ou despesas pagas, além da URL oficial do arquivo. Despesas pagas são validadas e drenadas, mas não duplicam o total de despesas contratadas.
- Receitas são compactadas por candidato e classe determinística (`Recursos públicos`, `Recursos privados`, `Recursos próprios` ou `Não informado`); despesas são compactadas por categoria oficial. Valores permanecem `bigint` em centavos.
- As 28 regiões (`BR` e 27 UFs) são percorridas para fotos, propostas e certidões: 84 streams regionais. Arquivos órfãos ou fotos duplicadas rejeitam o retrato.
- O media store agora prepara geração vazia e remove separadamente apenas uma geração publicada. O job publica a geração nova antes da transação, descarta somente essa geração se a persistência falhar e remove a anterior apenas depois do commit. Falha de limpeza posterior é aviso seguro e não invalida o novo retrato.
- A reconciliação indexa nome civil normalizado, UF, partido e cargo/casa compatível; ambiguidades não geram sugestão. Toda sugestão nasce `pending`; decisões confirmadas/rejeitadas não são sobrescritas pelo reconciliador.
- A CLI administrativa exige candidatura e parlamentar existentes e URL `https:` oficial sob `tse.jus.br`, `camara.leg.br` ou `senado.leg.br`. Revisões gravam `operator_review`, horário e evidência. A saída contém apenas identificadores públicos e estado.
- `ELECTORAL_MEDIA_DIRECTORY` é resolvido uma vez para caminho absoluto. O README exige volume persistente em produção e documenta que a fonte do TSE não requer chave.

## TDD — RED observado

1. `npm test -- tests/jobs/sync-election.test.ts tests/jobs/reconcile-candidate-lawmakers.test.ts tests/server/config.test.ts`
   - Falhou porque `#/jobs/sync-election` e `#/jobs/reconcile-candidate-lawmakers` não existiam e os campos eleitorais de configuração estavam ausentes.
2. `npm test -- tests/integrations/tse/client.test.ts tests/integrations/tse/media-store.test.ts tests/server/electoral/repository.test.ts`
   - Falhou por ausência de `streamRowEntries`, `prepare`/`removePublished` e consultas públicas de geração/candidatura/parlamentar.
3. `npm test -- tests/jobs/sync-election.test.ts tests/server/electoral/repository.test.ts`
   - Falhou ao propagar erros de lock/descoberta em vez de retornar relatório e por não registrar `operator_review`.
4. `npm test -- tests/jobs/sync-election.test.ts`
   - Falhou ao classificar como privada uma receita cujo campo de origem dizia partido, mas cujo campo de fonte oficial dizia Fundo Especial.
5. `npm test -- tests/jobs/sync-election.test.ts`
   - Falhou ao manter duas linhas públicas separadas em vez de compactá-las em uma soma por candidato/categoria.

## GREEN e verificação

- Focado inicial: 6 arquivos, 64 testes aprovados; `npm run typecheck` aprovado.
- Bordas de lock/repositório: 2 arquivos, 23 testes aprovados; `npm run typecheck` aprovado.
- Streaming/compactação/reconciliação: 3 arquivos, 49 testes aprovados e, depois, 2 arquivos, 15 testes aprovados; `npm run typecheck` aprovado.
- CLIs exercitadas sem acessar o TSE:
  - `DATABASE_URL=... ELECTION_YEAR=2030 npm run sync:election` imprimiu JSON sanitizado com `UNSUPPORTED_ELECTION_YEAR` e saiu com código 1.
  - `DATABASE_URL=... npm run candidates:link -- invalid` imprimiu JSON sanitizado com `INVALID_ARGUMENTS` e saiu com código 2.
- Verificação completa final do código do commit `3b703e6`:
  - `git diff --check`: aprovado.
  - `TEST_DATABASE_URL=postgres://italojose@127.0.0.1:5435/legislativo_codex_test npm test`: 39 arquivos, 319 testes aprovados, 0 falhas.
  - `npm run typecheck`: aprovado, 0 erros.

Todos os comandos usaram Node `26.8.1` por `PATH=/Users/italojose/.local/share/fnm/node-versions/v26.8.1/installation/bin:$PATH`.

## Riscos e limites remanescentes

- A carga nacional real não foi disparada durante o teste para evitar baixar todos os arquivos oficiais; os limites, subtipos, 84 chamadas regionais e ciclo de publicação foram validados com ZIPs/streams controlados. A primeira execução real depende de os arquivos 2026 estarem publicados nos caminhos oficiais previstos.
- Uma falha ao apagar a geração antiga depois do commit pode deixar arquivos obsoletos ocupando disco; o novo retrato permanece correto e o relatório inclui `PREVIOUS_MEDIA_CLEANUP_FAILED` para limpeza operacional posterior.
- Sugestões automáticas continuam deliberadamente conservadoras e invisíveis ao público até confirmação administrativa com evidência oficial.
