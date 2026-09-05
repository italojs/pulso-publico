# Validação de release — catálogo de candidaturas 2026

## Identificação

- Execução: 5 de setembro de 2026, `America/Sao_Paulo`.
- Branch: `codex/candidate-catalog`.
- Base da Task 11: `464922fba35dc21ca81b1e6b03acc3df71cc843a`.
- Commit funcional validado: `4b09071` (`fix: align candidate sync with real TSE 2026 data`).
- Runtime: Node.js 26.8.1 e npm 11.19.0, sempre pelo binário explicitamente fixado no ambiente da tarefa.
- Banco: `legislativo_codex_dev`, PostgreSQL local em `127.0.0.1:5435`. O banco de teste separado foi usado pela suíte automatizada. Nenhum banco foi truncado ou substituído durante a validação real.
- `RTK.md` não existe no projeto; a ausência já era conhecida. Foram lidos `AGENTS.md`, plano, especificação, ledger, relatórios das Tasks 1–10, brief da Task 11, README, exemplos/configuração, scripts e documentação local do Next.js 16.3.4.

## Sincronização real do TSE

Antes da carga, as migrações foram aplicadas duas vezes. A página oficial e a allowlist do cliente foram conferidas; o TSE não exige chave. A consulta `HEAD` estimou cerca de 34 MB para os seis arquivos tabulares. Os 84 arquivos regionais compactados somaram 3.458.261.459 bytes: 124.000.722 de fotos, 301.998.306 de propostas e 3.032.262.431 de certidões. Havia 89 GiB livres antes da operação.

A execução bem-sucedida começou em `2026-09-05T11:11:32.844Z` e terminou em `2026-09-05T11:18:36.083Z`: 423,239 segundos. A transação final de banco durou 29,192 segundos, entre `11:18:06.793Z` e `11:18:35.985Z`. O retrato oficial principal foi extraído em `2026-09-04T22:31:18Z`.

Contagens lidas da fonte durante a carga:

| Recurso | Registros/arquivos aceitos |
|---|---:|
| Candidaturas | 20.880 |
| Complementos | 20.880 |
| Bens | 76.800 |
| Coligações | 4.337 |
| Redes sociais, antes da deduplicação | 56.765 |
| Receitas | 38.931 |
| Despesas contratadas | 62.836 |
| Despesas pagas, validadas sem dupla soma | 19.214 |
| Fotos | 20.871 |
| Propostas de governo | 227 |
| Certidões | 12.318 |

O retrato persistido contém 20.880 candidaturas, 76.800 bens, 37.288 componentes financeiros agregados na entrada, 47.908 links sociais, 227 propostas e 12.318 documentos. Os avisos sanitizados foram `ORPHAN_TABULAR_ENTRIES_SKIPPED`, `DUPLICATE_SOCIAL_LINKS_SKIPPED` e `ORPHAN_MEDIA_ENTRIES_SKIPPED`. Eles refletem somente linhas oficiais que não podiam pertencer de modo inequívoco ao mesmo retrato, não uma publicação parcial.

As tentativas diagnósticas anteriores falharam de forma estável e sem trocar o retrato público. O banco registrou 12 falhas com códigos sanitizados, entre eles `DUPLICATE_CANDIDATE`, `CONFLICTING_COALITION_MATCH`, `INVALID_BOOLEAN`, `INVALID_MEDIA_CANDIDATE_ID`, `INVALID_MEDIA_FORMAT`, `MISSING_GEOGRAPHIC_REGION`, `MISSING_STATUS`, `ORPHAN_MEDIA_ENTRY`, `UNSAFE_STORAGE_PATH` e um invólucro `ELECTORAL_SYNC_FAILED`. Cada causa reproduzida recebeu um teste RED antes da menor correção. A fonte mudou durante os diagnósticos — uma sondagem encontrou 20.874 fotos e a carga final, 20.871 — por isso as contagens acima pertencem exclusivamente ao retrato publicado final. O staging terminou vazio e a geração anterior só foi removida depois do commit atômico.

### Proveniência tabular publicada

| Recurso | URL oficial | Extração oficial |
|---|---|---|
| Candidaturas | `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip` | `2026-09-04T22:31:18Z` |
| Complementos | `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip` | `2026-09-04T22:31:18Z` |
| Bens | `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip` | `2026-09-04T22:31:18Z` |
| Coligações | `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_coligacao/consulta_coligacao_2026.zip` | `2026-09-04T22:30:08Z` |
| Redes sociais | `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/rede_social_candidato_2026.zip` | `2026-09-04T22:30:49Z` |
| Prestação de contas | `https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip` | `2026-09-04T07:05:48Z` |

## Invariantes de banco e exposição pública

- Há uma execução 2026 bem-sucedida e ela é a única candidata a “latest”. As 20.880 identidades são únicas por `external_id`, pertencem a uma única geração e nenhuma está fora da geração publicada.
- Bens (76.800), totais de campanha (11.796), redes (47.908), propostas (227) e documentos (12.318) têm zero filhos fora da geração publicada e zero órfãos.
- As somas por categoria divergiram do total em 0 receitas, 0 despesas e 0 saldos. Há 9.084 candidaturas sem linha financeira; isso permanece ausente. Separadamente, 277 têm receita explicitamente zero e 7.784 têm despesa explicitamente zero.
- O esquema eleitoral teve zero nomes de coluna compatíveis com CPF, e-mail pessoal, título eleitoral, credencial, cookie ou token de sessão. As respostas HTML verificadas tiveram zero marcador de chave de armazenamento, caminho local ou `bigint`.
- Existem 75 sugestões de vínculo pendentes. Um perfil real cujo parlamentar sugerido já possui evidência legislativa retornou HTTP 200, mostrou o estado neutro “Não existe histórico parlamentar confirmado” e não renderizou projetos. Em uma base isolada, um vínculo rejeitado com autoria sintética também retornou o mesmo estado e não vazou a evidência. Um vínculo confirmado sintético foi exercitado separadamente, conforme descrito abaixo.
- O isolamento de contas foi conferido em transação: conta A listou 1 item; conta B, 0; a tentativa de remoção por B removeu 0; A continuou com 1. O rollback deixou 0 linhas de validação.

## Gates automatizados

Comandos equivalentes aos abaixo usaram o runtime fixado; as URLs de banco foram fornecidas por variável sem imprimir credenciais:

```text
npm run db:migrate                 # duas vezes, exit 0
npm test -- <sync + repository>    # 2 arquivos, 56/56; duas vezes
npm run typecheck                  # exit 0
npm test                           # 50 arquivos, 616/616
npm run build                      # exit 0, Next.js 16.3.4
git diff --check                   # exit 0
```

O build manteve catálogo, perfil, comparação, mídia, follows e `/seguindo` como rotas dinâmicas. A revisão ampla do diff cobriu contratos oficiais por subtipo, limites e drenagem de ZIP, proveniência, atomicidade, batching PostgreSQL, escopo da geração pública, serialização e estados responsivos. Não restou finding material aberto.

## Validação manual em desktop

O servidor da branch rodou contra o banco validado em `http://localhost:3100`; o processo que já ocupava a porta 3000 não foi interrompido.

- `/candidatos`: menu em ordem Projetos, Candidatos, Seguindo e Alertas; 20.880 resultados, 20 cartões na página 1 de 1.044 e Brasil inteiro com `GEO_PROVIDER=none`.
- Filtros: a URL canônica com cargo de deputado federal e SC retornou 231 resultados e 12 páginas; a ida à página 2 preservou filtro e chip. O painel avançado abriu como diálogo, recebeu foco, fechou por `Escape` devolvendo o foco e aplicou “recursos públicos” (151 resultados no recorte). A remoção de chip/UF voltou a Brasil inteiro e exibiu UFs distintas. O controle nativo `<select>` do automatizador não dispara o `onChange` do React; esse ponto foi validado pela navegação canônica SSR e pelos testes de interação, sem classificá-lo como defeito do produto.
- Perfis: uma candidatura real com foto exibiu imagem oficial, link para o DivulgaCand, situação, bem de R$ 50 mil, receita de R$ 15.740, despesa explicitamente zero, certidão, redes e rótulos de origem/horário. Outra candidatura real confirmou fallback de foto e estados ausentes de bens, campanha, certidão e proveniência sem transformá-los em zero.
- Histórico: os dados reais mostraram o estado neutro, pois nenhum vínculo estava confirmado. Na base isolada, um vínculo inequívoco marcado `task11_isolated_seed` apresentou 11 projetos e 11 votos, cobertura de 2 a 12 de agosto, autoria principal/coautoria e distribuição textual de votos. Projetos e votos avançaram independentemente de 1/2 para 2/2, preservaram os dois parâmetros na URL e limitaram `999` à última página. O vínculo rejeitado isolado não apareceu. Todas as sementes foram removidas; as duas verificações finais retornaram 0 linhas residuais.
- Comparação: a seleção de duas candidaturas foi preservada ao atravessar páginas. A comparação compatível exibiu fatos e fontes lado a lado sem nota ou vencedor. Uma combinação incompatível de circunscrição foi recusada com explicação; URL manipulada com quatro IDs foi recuperada pelo limite de três e conteúdo sem score/ranking.
- Conta: o clique anônimo em seguir redirecionou exatamente para `/entrar?next=%2Fcandidatos%2F2026%2F30002554423`. Uma conta sintética entrou, seguiu a candidatura, recebeu a confirmação acessível e viu o item com selo `TSE` em `/seguindo`. O unfollow foi enviado pela mesma sessão autenticada e a página recarregada mostrou o estado vazio. O automatizador não aceitou a confirmação nativa do botão de remoção, portanto essa última escrita foi exercitada pela chamada autenticada equivalente, não pelo clique. A conta, sessão e follow sintéticos foram removidos, sem tocar conta real.

## Mobile e acessibilidade

Em viewport 390×844:

- o catálogo teve largura de documento 390, cartões de 366 px em uma coluna e navegação dentro de 378 px;
- o painel avançado ocupou 390×844, manteve botão de fechar focável, fechou por `Escape` e não criou overflow;
- o perfil teve largura útil de 366 px, ordem legível do dossiê e tabelas sem ampliar o documento;
- a comparação trocou a tabela desktop pelos cartões móveis, com largura de 366 px e equivalentes textuais presentes;
- os textos visuais da conta foram recolhidos apenas abaixo de 420 px; os nomes acessíveis Candidatos, Seguindo, Alertas e Entrar continuaram no AX tree;
- fallback de foto, diálogo, checkbox de seguir e status `aria-live` foram inspecionados no accessibility tree. As tabelas de distribuição preservaram cabeçalhos e valores textuais, e a folha contém uma regra específica de redução de movimento coberta pela suíte.

Limitação honesta: o modo reduzido de movimento foi validado por DOM/CSS e teste automatizado, não pela troca da preferência global do sistema operacional. Screenshots não foram necessários para decidir os defeitos encontrados.

## Defeitos encontrados e corrigidos com RED → GREEN

1. Contratos reais divergiam das fixtures em duplicidade Brasil/região, coligação, status `-3`, região BR e nulabilidade de reeleição.
2. Bens oficiais incluem ajuste negativo e exigem `NR_ORDEM_BEM_CANDIDATO` na identidade; sem isso havia colisões legítimas.
3. Prestação de contas usa cabeçalho próprio para despesas pagas e horários distintos entre subtipos; os pagos são validados, não somados novamente às despesas contratadas.
4. Mídia real contém `leiame.pdf`, IDs de 11–12 dígitos, prefixo especial de certidões e um órfão; auxiliares/órfãos agora são drenados sob limite e reportados.
5. Redes reais contêm órfãos e URLs repetidas; a publicação mantém somente linhas pertencentes ao retrato e a primeira URL normalizada.
6. Coleções reais excederam o orçamento de parâmetros do PostgreSQL; filhos agora são gravados em lotes de 500 e limpos por subconsulta set-based.
7. A navegação media 420 px em viewport de 390 px; um teste RED capturou o overflow e a regra móvel reduziu o documento a 390 px mantendo nomes acessíveis.
8. As telas de entrada/cadastro ainda omitiam candidaturas na explicação da conta; o teste RED de copy falhou em 2/2 e passou em 2/2 depois da correção mínima.

## Rodada de revisão final — 5 de setembro de 2026

A revisão partiu do HEAD `d639e62` e produziu o commit funcional `0662858` (`fix: harden candidate release invariants`). Todos os achados foram reproduzidos em teste antes da mudança de produção.

### Contratos endurecidos

- Cada um dos cinco recursos tabulares regionais agora só é aceito quando o ZIP contém exatamente a partição canônica Brasil mais as 27 UFs. Ausência, duplicidade, região inesperada e arquivo regional isolado rejeitam a carga antes de qualquer manifest; somente os arquivos disjuntos pretendidos são processados e as demais entradas são drenadas sob limites.
- Receitas, despesas contratadas e despesas pagas preservam suas próprias marcas temporais tanto nos registros quanto no manifest. A marca agregada continua sendo o máximo somente para exibição. Se um manifest legado tiver apenas a marca agregada, ela ainda funciona como piso para os três subtipos na primeira carga nova; essa primeira carga estabelece os três baselines independentes e qualquer regressão posterior de um único subtipo rejeita a publicação inteira.
- A identidade oficial de bem passou a ser candidatura mais `source_order` quando a ordem existe. Duplicata exata tem rejeição determinística conforme o contrato, conflito na mesma ordem é recusado e linhas legadas com ordem nula continuam compatíveis. A migração `0010_naive_mac_gargan.sql` adiciona o índice único parcial correspondente.
- O comando de vínculo usa a mesma validação canônica do domínio: IDs públicos de candidatura com 11 ou 12 dígitos são aceitos; comprimentos diferentes são rejeitados.
- Somente `saldoMin` e `saldoMax` aceitam sinal, dentro de todo o intervalo `bigint` do PostgreSQL e com mínimo menor ou igual ao máximo. Receita, despesa e bens continuam não negativos. O comportamento é simétrico entre GET nativo, JSON, URL canônica, formatter e consulta SQL.
- Depois de uma exceção ambígua na persistência, o job consulta status, ano e contagem da geração: sucesso confirmado é normalizado como sucesso verdadeiro sem remover mídia; falha definitiva descarta staging; resultado pendente, divergente ou impossível de consultar retém a geração para reconciliação segura e devolve somente erro sanitizado.
- O próprio record de rede social exige HTTP(S) sem credencial; nomes de mídia são limitados por bytes UTF-8; texto livre rejeita NUL, controles C0/C1 e Unicode malformado em todas as fronteiras; a URL de comparação do README usa `ano=2026` e parâmetros `id` repetidos.

Durante o resync em Node 26.8.1, dois problemas adicionais de robustez foram reproduzidos antes da correção. O staging mantinha um `FileHandle` sujeito à finalização fatal do runtime; ele passou a usar criação exclusiva por stream, mantendo as garantias contra colisão e symlink. Uma entrada de mídia que parasse depois de ser entregue pelo ZIP não observava o cancelamento; a iteração agora disputa cada avanço com o `AbortSignal`, destrói a entrada e termina com `TSE_REQUEST_ABORTED`. O teste RED exato excedia 5 segundos; o GREEN encerrou em cerca de 16 ms.

### Migração e sincronização oficial repetida

A migração nova foi aplicada duas vezes, com exit 0, em uma base descartável, na base de teste e na base de desenvolvimento. A verificação prévia encontrou zero pares candidatura/ordem duplicados; a verificação posterior encontrou exatamente um índice parcial. Uma integração real provocou a violação `23505` esperada para ordem não nula repetida e confirmou que a compatibilidade de ordem nula permanece. Nenhuma base foi truncada ou substituída.

O novo sync oficial começou em `2026-09-05T13:19:27.877Z`, terminou em `2026-09-05T13:25:01.505Z` e durou 333,628 segundos. A persistência local ocorreu entre `2026-09-05T13:24:37.978Z` e `2026-09-05T13:24:57.872Z`. O recurso principal de candidaturas tinha extração oficial em `2026-09-05T11:31:47Z`.

| Recurso | Entrada oficial aceita |
|---|---:|
| Candidaturas | 20.883 |
| Complementos | 20.883 |
| Bens | 76.806 |
| Coligações | 4.337 |
| Redes sociais, antes da deduplicação | 56.791 |
| Receitas | 38.931 |
| Despesas contratadas | 62.836 |
| Despesas pagas | 19.214 |
| Fotos | 20.872 |
| Propostas de governo | 227 |
| Certidões | 12.318 |

O retrato publicado contém 20.883 candidaturas, 76.806 bens, 37.288 componentes financeiros agregados, 11.796 totais de campanha, 47.932 links sociais, 227 propostas e 12.318 documentos. As três marcas financeiras publicadas são, respectivamente, `2026-09-04T07:05:48Z`, `2026-09-04T07:05:47Z` e `2026-09-04T07:05:40Z`; a marca agregada é o máximo `2026-09-04T07:05:48Z`. Os únicos avisos foram `ORPHAN_TABULAR_ENTRIES_SKIPPED`, `DUPLICATE_SOCIAL_LINKS_SKIPPED` e `ORPHAN_MEDIA_ENTRIES_SKIPPED`.

Tentativas anteriores da rodada falharam ou foram interrompidas antes da publicação enquanto os dois problemas de streaming eram diagnosticados. Cada geração exata foi descartada depois de o resultado ser conhecido. O retrato válido anterior permaneceu disponível em todas elas. A tentativa final usou timeout regional limitado a 120 segundos, publicou exatamente uma geração e deixou zero gerações em staging.

### Invariantes e smokes da rodada

- Existem duas execuções bem-sucedidas de 2026, ordenadas; somente a mais recente define o retrato público. As 20.883 candidaturas têm 20.883 IDs externos distintos, uma identidade de geração por candidatura e zero linha fora da geração mais recente.
- Bens, totais financeiros, redes, propostas e documentos têm zero filhos fora do retrato. Há zero grupos repetidos de ordem oficial de bem e exatamente um índice parcial ativo.
- Os 11.796 totais financeiros têm zero divergência de receita, despesa ou saldo. Há 9.087 candidaturas sem total financeiro, 322 saldos negativos, mínimo de -R$ 1.349.775,00 e máximo de R$ 35.216.006,65.
- O manifest tem as três chaves de subtipo. Há 75 vínculos, todos pendentes; nenhum pendente ou rejeitado ficou público. O esquema eleitoral continua com zero coluna privada proibida e acompanhamentos continuam únicos por conta/candidatura.
- Em `127.0.0.1:3100`, o GET nativo e o POST JSON do intervalo de saldo negativo retornaram HTTP 200 e exatamente 322 candidaturas, sem serializar `bigint` nem chave de armazenamento. A foto semântica real retornou HTTP 200, `image/jpeg`, `nosniff` e corpo não vazio; tentativa de travessia retornou 404.
- O smoke do CLI aceitou os dois comprimentos canônicos e rejeitou os dois comprimentos inválidos sem fazer escrita. Um perfil real com vínculo pendente retornou HTTP 200, mostrou o texto neutro de ausência e não renderizou histórico confirmado. O endpoint de saúde respondeu HTTP 200.

### Gates repetidos

```text
migration 0010 em descartável/teste/dev, duas vezes    # exit 0
11 suítes focadas                                      # 295/295; duas vezes
npm test                                               # 51 arquivos, 644/644
npm run typecheck                                      # exit 0
npm run build                                          # exit 0, Next.js 16.3.4
git diff --check                                       # exit 0
```

As suítes focadas cobriram cliente regional, mapper, mídia/ownership, job/ack, repositório real, CLI, contratos de filtro, URL, consulta e UI. A validação desktop/mobile/autenticada da execução original permanece aplicável às superfícies não alteradas; nesta rodada, os filtros assinados, o CLI e a mídia foram exercitados novamente nas fronteiras modificadas.

## Estado final

O servidor de validação foi encerrado ao final; portas 3100 e 3101 ficaram livres. O processo preexistente na porta 3000 permaneceu ativo. O endpoint de saúde do servidor da branch respondeu HTTP 200, mas informou `degraded` para as fontes legislativas Câmara/Senado já presentes no banco; isso é uma limitação externa/operacional independente do retrato eleitoral TSE, não foi mascarada.
