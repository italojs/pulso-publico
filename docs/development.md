# Desenvolvimento

Este guia complementa o [início rápido](../README.md#início-rápido). Use Node.js `22.23.2`, npm `11.19.0` e PostgreSQL `18`; em uma instalação nova, execute `nvm install`, `nvm use` e `npm install --global npm@11.19.0`. Instale as dependências com `npm ci` para respeitar o lockfile. Não use `.env` ou banco de produção para desenvolver, testar ou demonstrar a interface.

Os comandos npm de jobs TypeScript usam o executor `tsx` fixado no lockfile para resolver os aliases do projeto no Node 22. Prefira esses comandos a executar `node scripts/arquivo.ts` diretamente. O servidor web standalone continua usando Node.

## Bancos locais e contêineres existentes

O exemplo usa `postgres://app:app@127.0.0.1:5435/legislativo`. O PostgreSQL do Docker só é exposto em loopback. O script de inicialização cria os bancos de teste e demo somente quando a instância é inicializada pela primeira vez.

Para verificar um contêiner que já existia:

```bash
docker compose exec postgres psql -U app -d postgres -c "SELECT datname FROM pg_database WHERE datname IN ('legislativo', 'legislativo_test', 'legislativo_demo', 'legislativo_test_demo');"
```

Se um banco estiver ausente, crie apenas aquele banco:

```bash
docker compose exec postgres psql -U app -d postgres -c "CREATE DATABASE legislativo_test OWNER app;"
docker compose exec postgres psql -U app -d postgres -c "CREATE DATABASE legislativo_demo OWNER app;"
docker compose exec postgres psql -U app -d postgres -c "CREATE DATABASE legislativo_test_demo OWNER app;"
```

Não execute `CREATE DATABASE` para um banco já existente e não apague contêineres ou volumes para forçar a inicialização. Dados do contêiner pertencem ao seu ambiente; faça backup antes de alterações operacionais.

As migrações são explícitas. `npm run db:migrate` usa `DATABASE_URL`, inclusive se você a sobrescrever no comando; não tem a restrição de destino aplicada ao seed e aos testes. Confira o destino antes de migrar.

## Demonstração sintética

```bash
DATABASE_URL=postgres://app:app@127.0.0.1:5435/legislativo_demo npm run db:migrate
DEMO_DATABASE_URL=postgres://app:app@127.0.0.1:5435/legislativo_demo npm run db:seed:demo
DATABASE_URL=postgres://app:app@127.0.0.1:5435/legislativo_demo npm run dev
```

O seed é transacional, aditivo e idempotente: três projetos, dois parlamentares, autoria, temas e movimentações inteiramente fictícios e identificados como demonstração. Não apaga tabelas, não cria usuários e não chama IA ou fontes externas. Os links de origem dos exemplos usam `example.invalid`, não representam documentos oficiais navegáveis.

O CLI não carrega `.env` e não usa `DATABASE_URL` como fallback. Exige `DEMO_DATABASE_URL` explícita, PostgreSQL em `localhost`, `127.0.0.1` ou `::1`, banco com nome terminado em `_demo`, sem parâmetros de URL, e recusa `NODE_ENV=production`. Ao servir o app com esse banco, IDs legislativos `demo-NNN` não acionam hidratação oficial. Não misture sincronizações de dados reais com esse ambiente de demonstração.

A demo não inclui candidaturas, finanças eleitorais ou votações. Crie uma conta fictícia local se quiser experimentar acompanhamentos e alertas; não há senha padrão.

## Testes e build

```bash
npm test
npm run test:watch
npm run typecheck
npm run build
```

O runner usa `postgres://app:app@127.0.0.1:5435/legislativo_test`, independentemente do `DATABASE_URL` de desenvolvimento. A regressão offline da demo usa outro banco descartável, `postgres://app:app@127.0.0.1:5435/legislativo_test_demo`, separado do banco de exploração `legislativo_demo`. Ela aplica migrações, acrescenta exemplos e altera seu estado de hidratação. Para um PostgreSQL personalizado, crie e configure ambos os destinos:

```bash
TEST_DATABASE_URL=postgres://app:app@127.0.0.1:5435/pulso_test DEMO_TEST_DATABASE_URL=postgres://app:app@127.0.0.1:5435/pulso_test_demo npm test
```

Os dois bancos devem existir, ser dedicados a testes e estar em loopback, sem parâmetros de URL. `TEST_DATABASE_URL` exige nome terminado em `_test`; `DEMO_TEST_DATABASE_URL` exige `_test_demo` e recusa o banco de exploração terminado somente em `_demo`. A proteção é aplicada antes da conexão. Testes de integração aplicam migrações e truncam tabelas no banco `_test`; a regressão da demo migra, semeia e altera o banco `_test_demo`. Nenhum dado nesses bancos deve ser importante. Não aponte o runner para túneis de produção expostos localmente.

Para alterações de schema, `npm run db:generate` gera migrações Drizzle; revise o SQL, versione a migração e execute `npm run db:migrate` no banco apropriado. Testes, typecheck e build são verificações distintas; aprovação de um não substitui os demais.

## Configuração opcional

Copie `.env.example` sem publicar o `.env` resultante. `OPENAI_API_KEY` e `OPENAI_MODEL` habilitam explicações legislativas por IA, inclusive impacto prático. `OPENAI_BASE_URL` define o endpoint do provedor. Sem chave/modelo, o aplicativo permanece utilizável.

`VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `NEXT_PUBLIC_VAPID_PUBLIC_KEY` configuram Web Push. A chave `NEXT_PUBLIC_` é pública e incorporada ao cliente no build; a privada nunca deve ir ao navegador. Alertas no aplicativo não dependem de VAPID. Use `GEO_PROVIDER=none` localmente; `cloudflare` e `vercel` podem sugerir UF em instâncias configuradas para esses provedores.

## Sincronização opcional de dados reais

Execute estes comandos somente após escolher e migrar conscientemente o banco de desenvolvimento, fora do ambiente `_demo`. Eles acessam fontes externas e podem escrever muitos registros:

```bash
npm run sync
npm run reconcile -- --source=all
npm run backfill:legislative -- --from=2019 --source=all
npm run backfill:votes -- --from=2019
npm run sync:election
npm run summaries -- 100
npm run alerts:dispatch
```

| Comando | Função |
| --- | --- |
| `sync` | Atualização incremental de Câmara e Senado e tentativa de entrega de push quando configurado. |
| `reconcile` | Reconciliação da janela oficial do dia anterior, independente da atualização incremental. |
| `backfill:legislative` | Catálogo retomável por ano; anos completos são ignorados, salvo com `--refresh`. |
| `backfill:votes` | Carga histórica de votos individuais disponibilizados pela Câmara. |
| `sync:election` | Novo retrato completo e atômico das candidaturas de 2026 e seus recursos oficiais. |
| `summaries` | Explicações opcionais para a janela superior do feed, até 100 projetos; ignorado sem chave e modelo. |
| `alerts:dispatch` | Nova tentativa dos pushes pendentes; sem VAPID não envia push. |

O ano inicial legislativo padrão é `LEGISLATIVE_HISTORY_START_YEAR=2019`. A configuração permite outros anos a partir de 1946, mas escolher um intervalo não garante completude histórica da fonte. Sincronizadores usam advisory locks para impedir concorrência no mesmo job; ainda é responsabilidade do operador dimensionar carga e monitorar erros.

O coletor histórico de maior alcance tem tarefas, cursores, retomada e controle de armazenamento. Comece por uma unidade, não por uma execução contínua não supervisionada:

```bash
npm run collect:history -- --from=2019 --through=2026 --source=all --requests-per-minute=20 --once
npm run collect:status
```

`HISTORICAL_DATABASE_CAPACITY_BYTES` define a capacidade considerada pelo monitor, com padrão de 30 bilhões de bytes. Os níveis são aviso em 70%, crítico em 80% e interrupção de novas reservas em 90%. Lotes persistidos e cursores são preservados. Os scripts do coletor e de status também podem carregar `.env.production.local` quando presente: não mantenha esse arquivo no checkout de desenvolvimento e confira seu destino antes de executá-los.

### Carga eleitoral e armazenamento

`sync:election` reúne seis recursos tabulares: candidaturas, complementos, bens, coligações, redes sociais e prestação de contas; reúne ainda 84 arquivos regionais de fotos, propostas e certidões, cobrindo Brasil e 27 UFs para cada tipo. A carga real validada em setembro de 2026 transferiu aproximadamente 3,5 GB compactados. Essa medida é uma observação, não tamanho máximo garantido.

Planeje espaço persistente para o banco e ao menos 10 GB adicionais para mídia eleitoral com folga para a próxima geração; ajuste à carga real, extração, staging, backups e retenção. `ELECTORAL_MEDIA_DIRECTORY` é resolvido como caminho absoluto na inicialização e precisa apontar para armazenamento persistente em produção. Não inclua `.data` nem os arquivos baixados em commits.

A aplicação só troca o retrato público depois de validar a carga inteira. Uma falha mantém o último retrato e sua geração de mídia; monitore a idade e os erros do job. Antes da primeira carga, aplique migrações e confirme espaço para a geração publicada e a próxima em staging. O TSE não exige chave de API. A frequência oficial de atualização pode mudar: verifique o portal atual ao definir o agendamento.

### Revisão de vínculos candidatura–mandato

Sugestões permanecem pendentes e privadas até revisão explícita. O operador confirma ou rejeita usando identificadores públicos e evidência oficial. Os números abaixo ilustram a sintaxe, não confirmam uma correspondência real:

```bash
npm run candidates:link -- confirm --year=2026 --candidate=260001234567 --source=camara --lawmaker=220530 --evidence=https://dadosabertos.camara.leg.br/api/v2/deputados/220530
npm run candidates:link -- reject --year=2026 --candidate=260001234567 --source=camara --lawmaker=220530 --evidence=https://dadosabertos.tse.jus.br/dataset/candidatos-2026
```

Os comandos imprimem somente JSON sanitizado, sem linhas brutas do TSE. A execução eleitoral aceita apenas `ELECTION_YEAR=2026`.

### Ferramentas de lotes de impacto prático

Os comandos `practical-impact:prepare`, `practical-impact:append:5000`, `practical-impact:verify` e `practical-impact:verify:5600` operam seleção e conferência de lotes persistidos para o prompt de impacto prático. Os dois primeiros selecionam, respectivamente, uma base de até 600 projetos e um acréscimo de até 5.000; o último exige total de 5.600 na verificação. Não são parte do início rápido e não constituem, sozinhos, um fluxo automático de leitura integral, geração e revisão de todos os projetos. Confira os scripts e o estado do banco antes de usá-los; a geração padrão de resumos continua limitada à janela superior do feed.

## Catálogo de candidaturas

- `/candidatos` apresenta o retrato nacional de 2026 com busca, filtros rápidos/avançados, chips removíveis e paginação. Sem sugestão regional, começa com Brasil inteiro.
- `/candidatos/2026/<id público do TSE>` apresenta foto ou fallback, situação, bens, finanças, redes, proposta, certidões e proveniência conforme disponibilidade. Zero não vira ausência de informação.
- `/candidatos/comparar?ano=2026&id=<id>&id=<id>` compara até três candidaturas compatíveis; a seleção atravessa páginas do catálogo. Não há nota, ranking ou recomendação de voto.
- Seguir candidatura exige sessão e preserva o retorno na entrada/cadastro. Acompanhamentos aparecem em `/seguindo` e são exclusivos da conta.

O histórico legislativo no perfil depende de vínculo revisado e confirmado. Sugestões pendentes e rejeições não alteram o catálogo público.

## Filtros avançados do feed

O painel reúne sete seções recolhíveis: identificação; tramitação; datas e atividade; votações; assuntos e autoria; acompanhamento; e ordenação. Tipos, situações, temas, autoria e partidos têm busca e sugestões limitadas. Valores de um mesmo campo são alternativas (`PEC` ou `PL`); campos diferentes são combinados (tipo e tema).

Filtros compartilháveis ficam na URL. Seleções múltiplas usam parâmetros repetidos, como `/?tipo=PEC&tipo=PL&tema=Saúde&tema=Trabalho`; intervalos podem usar `anoInicio=2024&anoFim=2026` ou `apresentadaInicio=2024-01-01`. Alterar filtros volta à primeira página, preserva as outras seleções e omite parâmetros vazios. Uma opção que sair do catálogo continua visível como indisponível até ser removida.

O banco normaliza tipo, número, ano, fase geral determinística e categoria de resultado (`aprovada`, `rejeitada`, `outros` ou `não informado`) sem mudar o texto oficial. Siglas com segmentos alfabéticos separados por hífen, ponto ou sublinhado, como `SBT-A`, `R.C` e `ATA_PRE`, são reconhecidas até 20 caracteres. Fora dessa gramática, o tipo fica sem faceta, mas o projeto e seu texto continuam pesquisáveis.

“Mostrar somente projetos que acompanho” exige autenticação e é resolvido no servidor. Para visitantes, fica desabilitado e oferece entrada/cadastro com retorno preservado. Aplicar, contar e combinar filtros consulta somente registros sincronizados, sem IA. Aplique migrações aditivas antes de consultar ou sincronizar novas facetas.

## Histórico de decisões e validações

O [guia de arquitetura](architecture.md) e [dados e IA](data-and-ai.md) resumem os contratos atuais. Especificações detalhadas estão em [`superpowers/specs`](superpowers/specs), planos em [`superpowers/plans`](superpowers/plans) e relatórios em [`validation`](validation).

O [relatório dos filtros](validation/2026-09-04-filtros-avancados-validation.md), a [validação do catálogo eleitoral](validation/2026-09-04-catalogo-candidatos-validation.md) e a [validação de base do MVP](validation/2026-09-03-mvp-validation.md) registram verificações históricas; consulte o código e execute as verificações atuais para uma nova mudança.
