# Validação — histórico legislativo desde 2019

Data: 6 de setembro de 2026  
Branch: `main`

## Migração e configuração

- Migração aditiva `0011_legislative_history.sql` aplicada sem exclusão de dados.
- `LEGISLATIVE_HISTORY_START_YEAR=2019` ativo no ambiente local.
- Checkpoints históricos permanecem separados de `sync_checkpoints`.
- Os 16 checkpoints esperados, Câmara e Senado de 2019 a 2026, terminaram com estado `complete`.

## Backfill real

- Comando: `npm run backfill:legislative -- --from=2019 --source=all`.
- Unidades processadas pelas fontes: 445.044 registros, persistidos por `upsert`.
- Projetos distintos no banco depois da carga e do sincronismo final: 445.822.
- Projetos distintos com ano oficial de 2019: 30.835.
- Tempo agregado das unidades concluídas: 349 segundos.
- Banco antes: 535 MB.
- Banco depois do catálogo básico: 551 MB.
- Banco depois de autorias e temas oficiais: 955 MB.
- Crescimento total observado: 420 MB.
- O transporte atual não mede bytes recebidos por arquivo; portanto, não foi inventada uma estimativa de volume transferido.

### Enriquecimento do catálogo

- Câmara: os arquivos anuais de proposições, autorias e temas foram cruzados de 2019 a 2026.
- Relações da Câmara no recorte: 517.173 autorias e 169.971 temas; 207.409 projetos têm autoria e 87.531 têm tema oficial disponível.
- Senado: a autoria resumida publicada nas consultas mensais foi preservada; 56.537 relações em 39.092 projetos no recorte.
- Listas agregadas de autoria do Senado são separadas deterministicamente em entradas limitadas, preservando o texto e o partido quando informado.
- Temas do Senado que não aparecem na consulta de catálogo continuam sendo obtidos da página oficial sob demanda, ao abrir o projeto; nenhum tema é inferido.
- A recarga enriquecida da Câmara levou aproximadamente 588 segundos. A do Senado levou aproximadamente 48 segundos, incluindo a primeira tentativa parcial e a retomada.

Durante a primeira execução, `RQS 11A/2019` revelou que a fonte do Senado aceita sufixo alfabético no número oficial. Um teste de regressão foi escrito antes da correção. O código agora preserva `RQS 11A/2019`, usa `11` apenas na faceta numérica e mantém `rqs:11a:2019` como chave oficial. Uma indisponibilidade transitória do Senado foi retomada sem reprocessar os 15 checkpoints já completos.

## Hidratação e reconciliação da PEC 221/2019

Rota validada: `/projetos/senado/9056435`.

- Registro Senado `9056435`: 30 movimentações.
- Parceiro exato da Câmara descoberto: `2233802`, `PEC 221/2019`.
- Registro Câmara hidratado: 406 movimentações e 123 eventos de votação.
- Votos individuais armazenados: 1.449.
- Comissão especial: descrição oficial contém 34 votos “Sim” e 4 votos “Não”.
- Plenário, primeiro turno: 472 “Sim” e 22 “Não”.
- Plenário, segundo turno: 461 “Sim” e 19 “Não”.
- A página manteve “Tramitação no Senado” e “Tramitação na Câmara” em blocos separados.
- Um segundo acesso usou o estado de hidratação completo persistido.
- O cabeçalho da linha do tempo exibiu o total combinado correto de 436 movimentações.
- A autoria resumida e a autoria detalhada são deduplicadas pelo nome normalizado, preferindo o registro com identidade, partido e link mais ricos.

## Interface e filtros

- Validação visual no navegador interno em `http://127.0.0.1:3000/projetos/senado/9056435`.
- A linha do tempo exibiu 436 movimentações e 123 votações, separadas por Casa.
- As três votações de aceite apareceram na visão simplificada e na seção de votações.
- Validação visual do filtro `/?anoInicio=2019&anoFim=2019` retornou 30.835 registros e paginação de 1.542 páginas.
- O servidor respondeu HTTP 200 e permaneceu disponível em `0.0.0.0:3000`.
- O sincronismo final concluiu sem falha nas duas fontes e `/api/health` retornou `status: ok`.

## Gate automatizado

Executados com Node.js 26.8.1:

- `npm test`: 57 arquivos e 698 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado com Next.js 16.3.4.

## Revisão de integridade

- Uma visita atualiza `last_requested_at` sem renovar indevidamente a concessão de uma hidratação travada.
- O estado é conferido novamente depois da aquisição do advisory lock, evitando consultas duplicadas concorrentes.
- A sincronização periódica usa a mesma hidratação protegida e aprofunda apenas projetos seguidos ou acessados nos últimos sete dias.
- Falhas de programação ou banco não são mascaradas como indisponibilidade da fonte oficial.
- Estados vazio, pendente e falho têm mensagens públicas diferentes; dados antigos permanecem visíveis com aviso de atualização.
- O vínculo bicameral exige chave oficial idêntica, rejeita ambiguidades locais/remotas e funciona nas duas direções, Câmara e Senado.
- Sufixos oficiais como `11A` permanecem na chave e não colidem com o projeto sem sufixo.
