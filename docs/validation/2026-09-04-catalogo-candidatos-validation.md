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

## Estado final

O servidor de validação foi encerrado ao final; portas 3100 e 3101 ficaram livres. O processo preexistente na porta 3000 permaneceu ativo. O endpoint de saúde do servidor da branch respondeu HTTP 200, mas informou `degraded` para as fontes legislativas Câmara/Senado já presentes no banco; isso é uma limitação externa/operacional independente do retrato eleitoral TSE, não foi mascarada.
