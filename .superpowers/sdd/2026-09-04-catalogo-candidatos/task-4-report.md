# Task 4 — sincronização eleitoral e CLIs

## Status

Implementada sobre a base `f6d63d3`, com a fatia inicial no commit `3b703e6` (`feat: synchronize TSE election data`) e a primeira rodada de correções de revisão no commit `f23e7cf` (`fix: enforce complete electoral sync contracts`). Nenhuma parte da Task 5 foi iniciada.

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

## Rodada de revisão 1/5

### Achados reproduzidos em RED

O comando focado foi executado antes das correções:

`npm test -- tests/integrations/tse/client.test.ts tests/integrations/tse/mapper.test.ts tests/jobs/sync-election.test.ts tests/server/electoral/repository.test.ts`

Foram observadas 9 falhas cobrindo os contratos apontados pela revisão:

- ausência de manifesto final no streaming do recurso;
- publicação possível sem os três subtipos de prestação de contas;
- uso do horário local de início no lugar dos metadados oficiais;
- ausência de rejeição para metadados oficiais inconsistentes;
- colisão de URL entre duas certidões da mesma candidatura;
- sobrescrita de coligação/federação declarada com enriquecimento divergente;
- classificação de origem financeira desconhecida ou sentinela como recurso privado;
- ausência de uma normalização pública e compartilhada para sentinelas TSE.

O teste de integração do repositório para duas certidões com URLs oficiais distintas já passou no RED, demonstrando que a restrição existente aceita a identidade por arquivo e que uma migração não era necessária.

### Correções e decisões

- `TseOpenDataClient.streamResource` agora emite linhas tipadas e exatamente um manifesto após o consumo completo do ZIP. O manifesto registra a presença das entradas oficiais, não a quantidade de linhas; portanto um CSV válido apenas com cabeçalho ainda satisfaz o subtipo, enquanto a ausência de receitas, despesas contratadas ou despesas pagas falha com `MISSING_CAMPAIGN_SUBTYPE` antes da publicação.
- Cada linha dos seis recursos tabulares precisa conter `DT_GERACAO` e `HH_GERACAO` válidos. A consistência é estrita dentro de cada recurso; como arquivos oficiais independentes podem ser gerados em instantes diferentes, o instante do snapshot é o máximo determinístico entre os seis recursos. Proveniências de bens, redes e contas conservam o instante do próprio recurso. Datas impossíveis, formato inválido, metadata ausente ou divergente falham com códigos estáveis.
- A proteção contra snapshot antigo usa o instante oficial calculado, e não `startedAt`. O horário local continua somente como `checkedAt` e timestamps operacionais.
- Propostas e certidões recebem uma identidade pública estável por entrada, preservando o host oficial do TSE e adicionando o nome do arquivo no fragmento da URL do arquivo oficial. Assim, duas certidões da mesma candidatura persistem separadamente sob a restrição `(candidate_id, official_url)`, sem alteração de schema.
- O enriquecimento de coligação/federação preserva valores declarados equivalentes e falha com `CONFLICTING_COALITION_ENRICHMENT` quando encontra divergência. Divergências entre linhas da própria fonte de coligações continuam falhando com `CONFLICTING_COALITION_MATCH`.
- Complementos são aplicados incrementalmente ao mapa de candidaturas e coligações/federações são reduzidas incrementalmente a um mapa limitado por chave eleitoral; nenhuma lista bruta desses recursos permanece em memória.
- A normalização de sentinelas TSE foi centralizada em `normalizeTseOptionalValue`. `#NULO`, `#NE`, `-1` e demais sentinelas suportadas viram ausência. A classificação financeira passou a uma allowlist explícita; valores desconhecidos produzem `Não informado`.
- O ciclo de gerações permaneceu protegido por regressões: uma falha de persistência descarta somente a geração nova e a antiga só é removida depois do commit bem-sucedido. Os 84 streams regionais e a ausência de colunas privadas também permanecem cobertos.

### GREEN e verificação da rodada

Todos os comandos usaram Node `26.8.1` e, nos testes de integração, `TEST_DATABASE_URL=postgres://italojose@127.0.0.1:5435/legislativo_codex_test`.

- Testes focados finais: 7 arquivos, 85 testes aprovados, 0 falhas.
- `npm run typecheck`: aprovado, 0 erros.
- `git diff --check`: aprovado.
- Suíte completa: 39 arquivos, 330 testes aprovados, 0 falhas.
- Commit de código da rodada: `f23e7cf` (`fix: enforce complete electoral sync contracts`).

### Riscos remanescentes após a rodada

- A carga nacional real continua não executada nesta etapa; o contrato foi validado com arquivos ZIP e streams controlados, incluindo entradas sem linhas, duas certidões, metadata oficial e todas as regiões.
- A identidade pública por fragmento depende do nome da entrada no ZIP permanecer estável para manter a mesma URL entre cargas, embora continue apontando para o arquivo oficial do TSE e não exija alteração de schema.
