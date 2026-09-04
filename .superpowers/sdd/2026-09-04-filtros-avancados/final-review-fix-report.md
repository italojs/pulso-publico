# Relatório de correções da auditoria final

Data: 4 de setembro de 2026

Worktree: `.worktrees/advanced-filters`

Branch: `codex/advanced-filters`

## Commits e escopo

- Base auditada: `786f16d` (`docs: complete mobile filter validation`).
- Implementação e regressões: `e2ef63a` (`fix: resolve final advanced filter audit`).
- A especificação e o plano não foram editados. README, validação e este relatório documentam apenas o comportamento e as evidências atualizados.

## Mapa finding → teste → correção → evidência

| # | Severidade | Teste RED | Correção mínima robusta | Evidência GREEN |
| --- | --- | --- | --- | --- |
| 1 | Important | Parser rejeitava `SBT-A`, `EMC-A` e `SBE-A`; mappers não entregavam identidade estruturada; repositório e migração não preenchiam tipo/número sem ano válido; URL/Zod rejeitavam tipos hifenizados. O lote focado começou com 9 falhas em 6 arquivos. | Gramática oficial compartilhada em `bill-facets`; identidade estruturada nos mappers da Câmara e Senado como fonte primária, parser por campo como fallback; migração forward `0004_proposal_identity_backfill.sql`, snapshot e journal; serializador, parser de URL e Zod usam a mesma normalização. | 7 arquivos e 77 testes focados passaram. Migração aplicada em dev/test. Em dev, 257.366 projetos foram preservados e tipo/número nulos caíram de 133.495 para 48; 30.503 `PRL 1/0` ficaram com tipo/número e ano nulo; 4.738 tipos hifenizados ficaram estruturados. |
| 2 | Important | A regressão exigiu 7 regiões com `details`, pesquisas e menos de 100 checkboxes com catálogos de 110 tipos, 523 situações, 240 temas, 180 autores e 30 partidos; antes da correção o fixture renderizou 195 checkboxes. A inspeção do banco real encontrou ainda 214 na primeira implementação. | Sete seções nativas recolhíveis; componente pesquisável que mantém selecionados e limita sugestões; aplicado a tipos, situações, temas, autoria e partidos, com 8 sugestões por catálogo. CSS mantém controles móveis e estados selecionado/indisponível. | Teste UI passou; no catálogo real foram medidos 91 checkboxes, 5 buscas, 7 `details` e 20.068 caracteres no HTML do diálogo. Pesquisas localizaram `SBE-A`, a última situação, tema, autoria e partido dos fixtures. |
| 3 | Important | Primeira ativação de `followedOnly` esperava referências deduplicadas do `localStorage`, e a página aberta precisava reagir a follow/unfollow; ambos falharam antes da correção. | Helper único `parseLocalBillReferences`; `FeedFilters` lê as referências desde o mount e assina `pulso:follows-changed`; resultados anônimos assinam o mesmo evento e voltam à página 1. | Testes cobrem primeira ativação e eventos com página aberta. No navegador, a prévia mudou de `1 projeto encontrado` para `0 projetos encontrados` após unfollow. Referências não apareceram em URL nem resposta. |
| 4 | Important | Grupos de votação não tinham opção neutra nem limpeza independente. | `Todos` e `Qualquer situação` mapeiam para `undefined`, sem alterar tipos de votação ou os demais campos. | Regressão confirma body de prévia somente com `voteKinds: ["nominal"]` e ausência dos dois campos limpos na submissão. |
| 5 | Important | Com `q` ativo, o input hidden entrava no seletor do focus trap e o ciclo quebrava no botão Aplicar. | Seletor exclui `input[type=hidden]` e elementos ocultos ou dentro de `details` fechados; resumos recolhíveis permanecem focáveis. | Regressão com query ativa percorre Fechar ⇄ Aplicar, fecha por Escape e devolve foco ao invocador. Navegador confirmou foco inicial em Fechar e nunca no hidden. |
| 6 | Important | Formulário rápido perdia valores repetidos e o painel removia seleções ausentes do catálogo. Um teste adicional mostrou que controles locais não ressincronizavam após navegação canônica. | Forms controlados; dimensões não alteradas são preservadas pelo serializador e por hidden inputs repetidos; selecionados ausentes são unidos ao catálogo e marcados `indisponível`; anos ausentes recebem option preservada; props canônicas ressincronizam ambos os forms. | Regressões cobrem query, fonte, situação e tema repetidos, página removida, valores obsoletos e navegação. Percurso manual manteve `ZZZ`, ano 1999, situação, tema e autoria legados sinalizados até remoção explícita. |
| 7 | Minor | Teste RED distinguiu conta com follow existente, mas zero matches por tipo, de UUID sem nenhum follow; `hasPublicBillFollows` inicialmente não existia. | Consulta de existência independente dos filtros ativos; `app/page.tsx` passa `emptyFollowed` somente quando a conta não segue projeto algum. | Regressão de query passou; zero matches mantém a mensagem de filtros, enquanto zero follows usa o convite para começar a acompanhar. |
| 8 | Minor | Erros de ano, apresentação e atividade não tinham IDs nem associações dos campos. | IDs estáveis por `useId`; ambos os limites recebem `aria-describedby`, `aria-errormessage` e `aria-invalid` somente enquanto inválidos. | Regressões dos três intervalos passaram. Manualmente, os dois selects de ano apontaram para o mesmo ID do alerta e reportaram `aria-invalid=true`. |
| 9 | Minor | Primeira submissão avançada incluía parâmetros vazios. | Quick e advanced interceptam submit, constroem a URL com `buildFeedHref` e navegam pelo router; controles vazios omitem `name`; página volta a 1. | Regressão espera `/?tipo=PL`. Manual com query ativa gerou exatamente `/?q=jornada&tipo=SBE-A`, sem parâmetro vazio. |
| 10 | Recomendação | `EXPLAIN (ANALYZE, BUFFERS)` executado para atividade nos últimos 30 dias. | Nenhuma materialização foi adicionada sem necessidade comprovada. | 4.998 resultados em 387,523 ms local; o plano varreu 257.366 projetos e fez buscas index-only correlacionadas em movimentos e votações. A limitação está documentada para monitoramento. |

## Verificação final

| Verificação | Resultado |
| --- | --- |
| Testes focados de identidade, rotas e migração | 7 arquivos, 77 testes, exit 0 |
| Testes focados de UI | 1 arquivo, 25 testes, exit 0 |
| `npm test` com Node 26.8.1 e banco de teste indicado | 32 arquivos, 223 testes, exit 0, 9,48 s |
| `npm run typecheck` | exit 0, sem diagnósticos |
| `npm run build` com banco de desenvolvimento | exit 0; 15/15 páginas estáticas geradas |
| `npm run db:migrate` em desenvolvimento e testes | exit 0 nos dois bancos |
| `git diff --check` | sem erros |

O percurso real foi executado em `http://localhost:3002` e o servidor foi encerrado. Em desktop foram verificados recolhimento, pesquisa, foco com `q`, URL canônica, primeira prévia anônima, unfollow reativo e opções indisponíveis. Em 390×844 o diálogo ocupou exatamente o viewport, não apresentou overflow horizontal, teve corpo rolável e rodapé visível. A aba efêmera foi fechada. O banco de testes foi limpo ao final: `bills=0`, `users=0`, `followed_bills=0`.

## Limitação remanescente

A consulta de atividade recente ainda usa dois máximos correlacionados. O resultado local abaixo de 0,4 s não justificou materialização fora do escopo, mas o plano envolve cerca de 514 mil buscas em índices para 257.366 projetos. Recomenda-se acompanhar essa latência com o crescimento da base. Não há outro impedimento técnico conhecido nesta rodada.
