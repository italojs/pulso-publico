# Relatório de correções da auditoria final

Data: 4 de setembro de 2026

Worktree: `.worktrees/advanced-filters`

Branch: `codex/advanced-filters`

## Commits e escopo

- Base auditada: `786f16d` (`docs: complete mobile filter validation`).
- Implementação e regressões: `e2ef63a` (`fix: resolve final advanced filter audit`).
- Evidências da primeira rodada: `8ca2400` (`docs: record final filter audit evidence`).
- Correção adicional do re-review: `cda4c25` (`fix: accept official proposal type grammar`).
- Correção operacional da `0005`: `154783c` (`fix: avoid no-op proposal backfill writes`).
- A especificação e o plano não foram editados. README, validação e este relatório documentam apenas o comportamento e as evidências atualizados.

## Mapa finding → teste → correção → evidência

| # | Severidade | Teste RED | Correção mínima robusta | Evidência GREEN |
| --- | --- | --- | --- | --- |
| 1 | Important | Parser rejeitava `SBT-A`, `EMC-A` e `SBE-A`; mappers não entregavam identidade estruturada; repositório e migração não preenchiam tipo/número sem ano válido; URL/Zod rejeitavam tipos hifenizados. O lote focado começou com 9 falhas em 6 arquivos. | Gramática oficial compartilhada em `bill-facets`; identidade estruturada nos mappers da Câmara e Senado como fonte primária, parser por campo como fallback; migração forward `0004_proposal_identity_backfill.sql`, snapshot e journal; serializador, parser de URL e Zod usam a mesma normalização. | 7 arquivos e 77 testes focados passaram. Migração aplicada em dev/test. Em dev, 257.366 projetos foram preservados e tipo/número nulos caíram de 133.495 para 48; 30.503 `PRL 1/0` ficaram com tipo/número e ano nulo; 4.738 tipos hifenizados ficaram estruturados. |
| 2 | Important | A regressão exigiu 7 regiões com `details`, pesquisas e menos de 100 checkboxes com catálogos de 110 tipos, 523 situações, 240 temas, 180 autores e 30 partidos; antes da correção o fixture renderizou 195 checkboxes. A inspeção do banco real encontrou ainda 214 na primeira implementação. | Sete seções nativas recolhíveis; componente pesquisável que mantém selecionados e limita sugestões; aplicado a tipos, situações, temas, autoria e partidos, com 8 sugestões por catálogo. CSS mantém controles móveis e estados selecionado/indisponível. | Teste UI passou; no catálogo real foram medidos 91 checkboxes, 5 buscas, 7 `details` e 20.068 caracteres no HTML do diálogo. Pesquisas localizaram `SBE-A`, a última situação, tema, autoria e partido dos fixtures. |
| 3 | Important | Primeira ativação de `followedOnly` esperava referências deduplicadas do `localStorage`, e a página aberta precisava reagir a follow/unfollow; ambos falharam antes da correção. | Helper único `parseLocalBillReferences`; `FeedFilters` lê as referências desde o mount e assina `pulso:follows-changed`; resultados anônimos assinam o mesmo evento e voltam à página 1. | Testes cobrem primeira ativação e eventos com página aberta. No navegador, a prévia mudou de `1 projeto encontrado` para `0 projetos encontrados` após unfollow. Referências não apareceram em URL nem resposta. |
| 4 | Important | Grupos de votação não tinham opção neutra nem limpeza independente. | `Todos` e `Qualquer situação` mapeiam para `undefined`, sem alterar tipos de votação ou os demais campos; os rádios neutros continuam no mesmo grupo nativo. | Regressão confirma body de prévia somente com `voteKinds: ["nominal"]`, os `name` compartilhados e a omissão dos dois filtros limpos na URL canônica. |
| 5 | Important | Com `q` ativo, o input hidden entrava no seletor do focus trap e o ciclo quebrava no botão Aplicar. | Seletor exclui `input[type=hidden]` e elementos ocultos ou dentro de `details` fechados; resumos recolhíveis permanecem focáveis. | Regressão com query ativa percorre Fechar ⇄ Aplicar, fecha por Escape e devolve foco ao invocador. Navegador confirmou foco inicial em Fechar e nunca no hidden. |
| 6 | Important | Formulário rápido perdia valores repetidos e o painel removia seleções ausentes do catálogo. Um teste adicional mostrou que controles locais não ressincronizavam após navegação canônica. | Forms controlados; dimensões não alteradas são preservadas pelo serializador e por hidden inputs repetidos; selecionados ausentes são unidos ao catálogo e marcados `indisponível`; anos ausentes recebem option preservada; props canônicas ressincronizam ambos os forms. | Regressões cobrem query, fonte, situação e tema repetidos, página removida, valores obsoletos e navegação. Percurso manual manteve `ZZZ`, ano 1999, situação, tema e autoria legados sinalizados até remoção explícita. |
| 7 | Minor | Teste RED distinguiu conta com follow existente, mas zero matches por tipo, de UUID sem nenhum follow; `hasPublicBillFollows` inicialmente não existia. | Consulta de existência independente dos filtros ativos; `app/page.tsx` passa `emptyFollowed` somente quando a conta não segue projeto algum. | Regressão de query passou; zero matches mantém a mensagem de filtros, enquanto zero follows usa o convite para começar a acompanhar. |
| 8 | Minor | Erros de ano, apresentação e atividade não tinham IDs nem associações dos campos. | IDs estáveis por `useId`; ambos os limites recebem `aria-describedby`, `aria-errormessage` e `aria-invalid` somente enquanto inválidos. | Regressões dos três intervalos passaram. Manualmente, os dois selects de ano apontaram para o mesmo ID do alerta e reportaram `aria-invalid=true`. |
| 9 | Minor | Primeira submissão avançada incluía parâmetros vazios. | Quick e advanced interceptam submit, constroem a URL com `buildFeedHref` e navegam pelo router; o serializador omite valores vazios e a página volta a 1. | Regressão espera `/?tipo=PL`. Manual com query ativa gerou exatamente `/?q=jornada&tipo=SBE-A`, sem parâmetro vazio. |
| 10 | Recomendação | `EXPLAIN (ANALYZE, BUFFERS)` executado para atividade nos últimos 30 dias. | Nenhuma materialização foi adicionada sem necessidade comprovada. | 4.998 resultados em 387,523 ms local; o plano varreu 257.366 projetos e fez buscas index-only correlacionadas em movimentos e votações. A limitação está documentada para monitoramento. |

## Re-review adicional — mapa issue → teste → correção → evidência

| Issue | Severidade | Teste RED | Correção mínima robusta | Evidência GREEN |
| --- | --- | --- | --- | --- |
| Gramática oficial e degradação segura | Important | 16 falhas reproduziram rejeição de `ATA_PRE`, `R.C` e `R.S` no parser, `BillRecord`, mappers, lote e URL. Um tipo `TIPO/INTERNO` ainda lançava Zod e abortava a página inteira. A migração não tinha a forward `0005`. | A gramática compartilhada aceita tokens de 2–20 caracteres formados por segmentos alfabéticos separados por `.`, `_` ou `-`; `BillRecord` normaliza um tipo não reconhecido para `null`, preservando projeto, número/ano estruturados e texto oficial. A nova `0005_proposal_identity_official_grammar.sql` faz apenas o backfill forward; `0004` não foi reescrita. | 10 arquivos / 170 testes focados passaram. Regressões diretas cobrem os três tipos, ambos os mappers, lote Câmara com item inválido sem aborto, URL/Zod, migration e busca textual de projeto com tipo `null`. Em dev, `ATA_PRE=2`, `R.C=6` e `R.S=40` ficaram completos; 257.366/257.366 códigos reconhecidos têm tipo/número e houve 0 divergências. O parser SQL fez uma varredura em 1.104,510 ms no conjunto inteiro. |
| Grupo nativo dos neutros | Minor | Os neutros não tinham `name`, portanto ficavam fora dos grupos e da navegação nativa; a regressão também exigiu submit canônico sem vazio. | Todos os rádios agora mantêm o `name` do fieldset. O valor neutro continua mapeado a `undefined`; `FormData` oferece o fallback GET e o handler usa `buildFeedHref` para omitir vazios da navegação final. | Teste UI comprova os dois grupos de três rádios, nomes, valor neutro e URL `/?tipoVotacao=nominal`. No Chrome real, `ArrowLeft` moveu `with` e `available` para os respectivos neutros; com `q=jornada`, o submit produziu `/?q=jornada&tipoVotacao=nominal`. Em 390×844 houve 7 seções e nenhum overflow horizontal. |

## Re-review operacional da migration 0005

| Issue | Severidade | Teste RED | Correção mínima robusta | Evidência GREEN |
| --- | --- | --- | --- | --- |
| Updates sem mudança material | Important | Em schema fresco, a primeira `0005` afetou 560 linhas em vez de 48: além dos tipos novos, reescreveu 512 `PRL n/0` com tipo/número completos porque `proposal_year IS NULL` bastava no `WHERE`. | Como a `0005` não foi publicada em produção, ela foi corrigida no próprio arquivo, sem criar `0006`. O CTE tipa os valores parseados e cada ramo de assignment/`WHERE` exige coluna alvo nula, valor parseado não nulo e `IS DISTINCT FROM`. | Primeiro run: exatamente 48 updates (`ATA_PRE=2`, `R.C=6`, `R.S=40`). Rerun: 0. As 512 linhas sem ano mantiveram o mesmo `ctid`; `TIPO/INTERNO` permaneceu inalterado. Um banco temporário vazio aplicou as seis migrations; `drizzle-kit check` aprovou a metadata. No dev já migrado, uma consulta somente leitura encontrou 0 candidatos; não houve rerun da 0005 e foi executado apenas `VACUUM (ANALYZE) bills`. |

## Verificação final

| Verificação | Resultado |
| --- | --- |
| Testes focados do re-review | 10 arquivos, 170 testes, exit 0 |
| Teste focado da migration operacional | 1 arquivo, 3 testes, exit 0; 48/0 updates e 512 `ctid` preservados |
| Testes focados de UI | 1 arquivo, 25 testes, exit 0 |
| `npm test` com Node 26.8.1 e banco de teste indicado | 32 arquivos, 247 testes, exit 0, 9,45 s |
| `npm run typecheck` | exit 0, sem diagnósticos |
| `npm run build` com banco de desenvolvimento | exit 0; 15/15 páginas estáticas geradas |
| `npm run db:migrate` em desenvolvimento e testes | exit 0 nos dois bancos |
| `db:migrate` em banco temporário vazio + `drizzle-kit check` | 6 migrations, schema criado, metadata válida e banco removido |
| `git diff --check` | sem erros |

O percurso principal foi executado em `http://localhost:3002`; o re-review usou uma sessão Chrome headless isolada em `http://127.0.0.1:3114`. Além de recolhimento, pesquisa, foco com `q`, URL canônica, primeira prévia anônima, unfollow reativo e opções indisponíveis, o re-review validou nomes de grupo e navegação por setas dos rádios. Em 390×844 o diálogo não apresentou overflow horizontal e manteve as sete seções. Servidor e Chrome foram encerrados, a aba efêmera foi fechada e o perfil temporário foi removido. O banco de testes foi limpo ao final: `bills=0`, `users=0`, `followed_bills=0`.

## Limitação remanescente

A consulta de atividade recente ainda usa dois máximos correlacionados. O resultado local abaixo de 0,4 s não justificou materialização fora do escopo, mas o plano envolve cerca de 514 mil buscas em índices para 257.366 projetos. Recomenda-se acompanhar essa latência com o crescimento da base. Não há outro impedimento técnico conhecido nesta rodada.
