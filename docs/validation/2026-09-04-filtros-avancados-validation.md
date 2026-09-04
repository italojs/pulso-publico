# Validação dos filtros avançados — 4 de setembro de 2026

## Ambiente e escopo

- Worktree: `.../.worktrees/advanced-filters`, branch `codex/advanced-filters`.
- Runtime: Node.js `v26.8.1`, npm `11.19.0`, Next.js `16.3.4` e PostgreSQL local em `127.0.0.1:5435`.
- Banco de desenvolvimento: `legislativo_codex_dev`; banco de testes: `legislativo_codex_test`.
- A validação inicial usou `http://localhost:3001`; a rodada de correção da auditoria final usou uma nova instância isolada em `http://localhost:3002`; e o re-review usou Chrome headless isolado em `http://127.0.0.1:3114`, sempre com `DATABASE_URL` apontando para desenvolvimento. A instância principal em `:3000` não foi interrompida; os processos adicionais e o perfil temporário foram encerrados e removidos ao final.

## Migração e backfill

Comando executado:

```bash
PATH='/Users/italojose/.local/share/fnm/node-versions/v26.8.1/installation/bin':$PATH \
  DATABASE_URL='postgres://italojose@127.0.0.1:5435/legislativo_codex_dev' npm run db:migrate
```

Resultado: exit code `0`; `drizzle-kit migrate` concluiu com `migrations applied successfully!` em desenvolvimento e testes. As migrações históricas `0003_advanced_filters.sql` e `0004_proposal_identity_backfill.sql` foram preservadas. A migração forward `0004` preenche tipo e número mesmo quando o ano não tem quatro dígitos e reconhece tipos hifenizados; a nova forward `0005_proposal_identity_official_grammar.sql` cobre a gramática oficial com segmentos separados por ponto ou sublinhado. Todas são aditivas e não contêm `DELETE`. O total permaneceu em 257.366 projetos; movimentações (18.398), eventos de votação (908) e resumos de IA (0) também foram preservados.

Antes de `0004`, havia 133.495 projetos sem tipo/número; 133.447 tinham identidade reconhecível pela gramática corrigida, incluindo 4.722 códigos hifenizados e 30.503 ocorrências de `PRL 1/0`. Depois de `0004` restaram 48 projetos: 2 `ATA_PRE`, 6 `R.C` e 40 `R.S`. A migração forward `0005` preencheu os 48; o banco passou a ter 257.366 projetos com tipo e número, sem divergência entre o código reconhecido e as facetas, 123.938 com tipo e ano, 4.738 tipos hifenizados, 2 com sublinhado, 46 com ponto e 30.503 `PRL 1/0` com tipo/número preenchidos e ano nulo.

Consulta de contagem, executada somente para leitura:

```sql
WITH bill_stage AS (
  SELECT simplified_stage::text AS category, count(*)::int AS count FROM bills GROUP BY simplified_stage
), vote_result AS (
  SELECT result_category::text AS category, count(*)::int AS count FROM vote_events GROUP BY result_category
)
SELECT 'bills_total' AS metric, count(*)::text AS value FROM bills
UNION ALL SELECT 'bills_parsed_type_and_year', count(*)::text FROM bills WHERE proposal_type IS NOT NULL AND proposal_year IS NOT NULL
UNION ALL SELECT 'bills_stage_' || category, count::text FROM bill_stage
UNION ALL SELECT 'vote_events_total', count(*)::text FROM vote_events
UNION ALL SELECT 'vote_events_result_' || category, count::text FROM vote_result
ORDER BY metric;
```

| Métrica | Contagem |
| --- | ---: |
| Projetos | 257.366 |
| Projetos com tipo e número extraídos | 257.366 |
| Projetos com tipo e ano extraídos | 123.938 |
| Projetos com tipo hifenizado | 4.738 |
| Projetos com tipo sublinhado | 2 |
| Projetos com tipo pontuado | 46 |
| `PRL 1/0` com tipo/número e ano nulo | 30.503 |
| Fase: apresentada | 110 |
| Fase: em comissões | 13.300 |
| Fase: pronta para votação | 3.896 |
| Fase: votada | 1.622 |
| Fase: sanção/veto | 37 |
| Fase: encerrada | 23.419 |
| Fase: não classificada | 214.982 |
| Eventos de votação | 908 |
| Resultado: aprovada | 860 |
| Resultado: rejeitada | 46 |
| Resultado: outros | 0 |
| Resultado: não informado | 2 |

## Planos de consulta

Todas as consultas abaixo foram executadas no banco de desenvolvimento com `EXPLAIN (ANALYZE, BUFFERS)`. Os tempos são os valores `Execution Time` do PostgreSQL e incluem uma execução com cache que pode variar entre máquinas.

| Caso representativo | Predicados | Tempo | Evidência de índice / observação |
| --- | --- | ---: | --- |
| Tipo + ano + tema | `PL`, `2025`, tema `Saúde` | 5,286 ms | `bills_pkey` foi usado para 224 projetos de `Saúde`; o planejador fez `Seq Scan` de `bill_topics` (2.789 linhas) e não selecionou `bills_proposal_type_year_idx`. |
| Casa atual + fase + data | Câmara, `closed`, 2024-01-01 a 2025-01-01 (início inclusivo, fim exclusivo) | 12,035 ms | `bills_pkey` forneceu a ordem de `id` com `LIMIT 20`; os três predicados ficaram como filtro. Não houve `Seq Scan`. |
| Nominal + resultado + UF | nominal, `approved`, UF `SP` | 2,241 ms | `bills_pkey` foi usado no acesso aos sete projetos finais. O planejador fez `Seq Scan` de `individual_votes` (2.413), `lawmakers` (731) e `vote_events` (908), e não selecionou `vote_events_result_category_idx`. |
| Acompanhados autenticados | UUID inexistente de usuário, limite 20 | 0,017 ms | `followed_bills_user_bill_uq`; 0 linhas; acesso seguinte a `bills_pkey` não foi executado. |
| Atividade recente | Últimos 30 dias sobre 257.366 projetos | 387,523 ms | 4.998 resultados; `Seq Scan` de `bills` e 257.366 buscas `Index Only Scan` em cada índice `movements_bill_occurred_at_idx` e `vote_events_bill_occurred_at_idx`. |

As quatro formas completas executadas foram:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT b.id FROM bills b
WHERE b.proposal_type = 'PL' AND b.proposal_year = 2025
  AND EXISTS (SELECT 1 FROM bill_topics t WHERE t.bill_id = b.id AND t.label = 'Saúde')
ORDER BY b.id LIMIT 20;

EXPLAIN (ANALYZE, BUFFERS)
SELECT b.id FROM bills b
WHERE b.current_house = 'camara' AND b.simplified_stage = 'closed'
  AND b.presented_at >= TIMESTAMPTZ '2024-01-01T03:00:00Z'
  AND b.presented_at < TIMESTAMPTZ '2025-01-01T03:00:00Z'
ORDER BY b.id LIMIT 20;

EXPLAIN (ANALYZE, BUFFERS)
SELECT b.id FROM bills b
WHERE EXISTS (
  SELECT 1 FROM vote_events v
  WHERE v.bill_id = b.id AND v.is_nominal = true AND v.result_category = 'approved'
    AND EXISTS (
      SELECT 1 FROM individual_votes iv JOIN lawmakers l ON l.id = iv.lawmaker_id
      WHERE iv.vote_event_id = v.id AND l.region = 'SP'
    )
)
ORDER BY b.id LIMIT 20;

EXPLAIN (ANALYZE, BUFFERS)
SELECT b.id FROM bills b
WHERE EXISTS (
  SELECT 1 FROM followed_bills fb
  WHERE fb.bill_id = b.id AND fb.user_id = '00000000-0000-0000-0000-000000000000'::uuid
)
ORDER BY b.id LIMIT 20;
```

Não foi criado novo índice. Os índices de faceta existem, mas o otimizador preferiu varrer somente relações pequenas em três casos, ou `bills_pkey` para satisfazer `ORDER BY b.id LIMIT 20`; nenhuma varredura sequencial de relação grande dominou o plano (a maior teve 2.789 linhas e o pior tempo foi 12,035 ms). Criar um índice adicional sem essa evidência contrariaria o critério da tarefa.

O caso de atividade recente é a exceção: a expressão usa dois máximos correlacionados e fez cerca de 514 mil buscas indexadas, além da varredura dos projetos. O tempo local ficou abaixo de 0,4 s, portanto não se introduziu materialização ou infraestrutura de atualização nesta rodada. Esse plano deve ser acompanhado se o volume crescer ou se a latência da prévia degradar.

## Rotas e verificações automatizadas

As duas requisições same-origin abaixo devolveram HTTP `200`:

```text
POST /api/projects/filter-count
{"filters":{"proposalTypes":["PEC","PL"],"topics":["Saúde"]},"anonymousBillKeys":[]}
=> {"total":157}

POST /api/projects/search
{"filters":{"followedOnly":true,"page":1,"pageSize":20},"anonymousBillKeys":[{"source":"camara","externalId":"2617687"}]}
=> total=1, totalPages=1, item=PL 1928/2026
```

| Comando | Resultado observado |
| --- | --- |
| `PATH='/Users/italojose/.local/share/fnm/node-versions/v26.8.1/installation/bin':$PATH TEST_DATABASE_URL='postgres://italojose@127.0.0.1:5435/legislativo_codex_test' npm test` | exit `0`; 32 arquivos e 247 testes aprovados em 9,36 s. |
| `PATH='/Users/italojose/.local/share/fnm/node-versions/v26.8.1/installation/bin':$PATH npm run typecheck` | exit `0`; `tsc --noEmit` sem diagnósticos. |
| `PATH='/Users/italojose/.local/share/fnm/node-versions/v26.8.1/installation/bin':$PATH DATABASE_URL='postgres://italojose@127.0.0.1:5435/legislativo_codex_dev' npm run build` | exit `0`; compilação em 410 ms, TypeScript em 231 ms e 15/15 páginas estáticas geradas. |

## Percurso manual reproduzível

Foi usada automação real do navegador embutido com árvore de acessibilidade e uma captura visual do painel móvel. Não foram gravados arquivos de screenshot persistentes.

### Desktop — 1280 × 720

- Em `http://localhost:3001/`, o painel abriu e fechou por `Escape`; após o fechamento o foco voltou para o botão `Filtros avançados`.
- O painel expôs exatamente sete seções semânticas e recolhíveis: **Identificação**, **Tramitação**, **Datas e atividade**, **Votações**, **Assuntos e autoria**, **Acompanhamento** e **Ordenação**. Recolher e reabrir **Tramitação** alterou o estado nativo de `details` como esperado.
- No catálogo real, o painel final manteve 91 checkboxes, 5 buscas e 20.068 caracteres de HTML, contra 912 checkboxes e cerca de 129 KB apontados pela auditoria. Tipos, situações, temas, autoria e partidos mostram no máximo 8 sugestões mais os valores já selecionados; buscas por `SBE-A` e por situação localizaram opções fora do primeiro lote.
- Com `q=jornada`, o foco inicial foi para **Fechar filtros avançados**, nunca para o input hidden. A opção neutra **Todos** removeu apenas o filtro de presença de votação.
- No re-review, os três rádios de **Há votação registrada?** compartilharam `name=votacao` e os três de **Votos individuais** compartilharam `name=votosIndividuais`. `ArrowLeft` moveu nativamente **Com votação** → **Todos** e **Disponíveis** → **Qualquer situação**. O `FormData` manteve o fallback GET dos campos neutros e a navegação JavaScript canonicalizou o resultado para `/?q=jornada&tipoVotacao=nominal`, sem valores vazios.
- Na rodada final, aplicar `SBE-A` preservando `q=jornada` produziu exatamente `/?q=jornada&tipo=SBE-A`: nenhum parâmetro vazio ou valor privado foi incluído. Os testes automatizados preservam também todos os valores repetidos de fonte, situação e tema ao alterar apenas `q` ou uma dimensão rápida.
- Um acompanhamento anônimo foi criado no próprio navegador. Ao ativar **Mostrar somente projetos que acompanho** pela primeira vez, a prévia exibiu `1 projeto encontrado`; depois de deixar de seguir com a página aberta, o evento local atualizou a mesma prévia para `0 projetos encontrados`. As referências ficaram fora da URL e da resposta.
- O URL com `tipo=ZZZ`, `anoInicio=1999`, situação, tema e autoria antigos manteve todos selecionados e os marcou como `indisponível`, inclusive o ano, até remoção explícita.
- As etiquetas ativas exibiram `Remover tipo PEC`, `Remover tipo PL` e `Remover tema Saúde`. Remover PEC levou a `/?tipo=PL&tema=Sa%C3%BAde&ordem=updated` sem remover os demais filtros. `Limpar tudo` levou de volta a `/?`.
- A página seguinte preservou filtros e acrescentou apenas `pagina=2`: `/?tipo=PL&tema=Sa%C3%BAde&ordem=updated&pagina=2`. O botão Voltar restaurou `/?tipo=PL&tema=Sa%C3%BAde&ordem=updated`.
- O URL `/?q=zzzzvalidacaosemresultado20260904` exibiu `0 registros oficiais` e a mensagem `Nenhum projeto apareceu com esses filtros.`
- No navegador anônimo, foi seguido localmente `PL 1928/2026` (Câmara, id externo `2617687`). Em `/?acompanhando=1`, a tela mostrou 1 resultado e o URL não continha chaves locais nem `followedBillKeys`.

### Autenticação temporária e limpeza

Para cobrir o escopo autenticado sem alterar dados reais, foi criado pela rota pública de cadastro o usuário temporário `validation.advanced-filters-20260904@invalid.test`; o redirecionamento chegou a `/?acompanhando=1&conta=criada`. A página `/seguindo` confirmou a sessão com `Sincronizado com validation.advanced-filters-20260904@invalid.test`.

Foi inserido exclusivamente para este teste um acompanhamento de `PL 1928/2026`:

| Registro temporário | UUID |
| --- | --- |
| Usuário | `d2887e32-4d26-455c-8dfe-0e584bf9a018` |
| Sessão | `c254723f-5eeb-4d43-b136-cce0a8f7cc26` |
| Acompanhamento | `babddd17-6936-4058-bb67-658940e2c2c3` |
| Projeto | `13d491d2-eb34-4b6f-b3c8-f8bb4c47c943` (`camara/2617687`) |

Com a sessão ativa, `/?acompanhando=1` retornou o único projeto no resultado SSR, e `/seguindo` listou o mesmo acompanhamento. A paginação geral já havia sido percorrida no desktop; o conjunto autenticado temporário continha só um item (`totalPages=1`), portanto não havia próximo/anterior específico para acionar.

No encerramento foram removidos explicitamente o acompanhamento, a sessão e o usuário acima, nessa ordem. A consulta de auditoria devolveu `before_cleanup: users=1, sessions=1, followed_bills=1` e `after_cleanup: users=0, sessions=0, followed_bills=0`.

### Mobile — 390 × 844

O percurso abaixo foi repetido em 4 de setembro em um contexto Chrome novo, controlado por Playwright efêmero apontando para o executável local do Chrome. `window.innerWidth × window.innerHeight` devolveu exatamente `390x844`; não foi salva captura persistente. As respostas relevantes foram `POST /api/projects/filter-count 200` e, no acompanhamento anônimo, `POST /api/projects/search 200`.

- O painel abriu com retângulo exato `390x844`, sem overflow horizontal no documento nem no diálogo. O corpo era rolável e o rodapé de ação permaneceu visível.
- O re-review repetiu a inspeção em `390x844`: sete seções, ambos os overflows horizontais falsos e o rádio neutro pertencendo a `name=votacao`.
- A submissão agora usa o serializador canônico também na primeira navegação; os parâmetros vazios anteriormente observados foram eliminados.
- As três etiquetas móveis foram `Tipo: PEC×`, `Tipo: PL×` e `Tema: Saúde×`. Acionar `Remover tipo PEC` deixou `/?tipo=PL&tema=Sa%C3%BAde&ordem=updated`; `Limpar tudo` retornou a `http://localhost:3001/`.
- Em um contexto novo sem cookies nem `localStorage`, abrir exatamente o URL compartilhável acima devolveu o mesmo URL e `157 registros oficiais`. Assim, os filtros públicos são reproduzíveis sem o estado do primeiro navegador.
- A página seguinte foi `/?tipo=PL&tema=Sa%C3%BAde&ordem=updated&pagina=2`; Voltar restaurou `/?tipo=PL&tema=Sa%C3%BAde&ordem=updated`.
- O URL `/?q=zzzzvalidacaosemresultado20260904` devolveu `0 registros oficiais` e uma ocorrência de `Nenhum projeto apareceu com esses filtros.`.
- No mesmo contexto anônimo, foi seguido localmente `PL 1928/2026` (`camara/2617687`). `/?acompanhando=1` devolveu `1 registros oficiais`; a URL permaneceu exatamente `http://localhost:3001/?acompanhando=1` e a verificação de `followedBillKeys` ou `2617687` nela foi `false`. A referência local foi, portanto, enviada só no corpo do `POST /api/projects/search`.

Para o trecho autenticado móvel, a rota pública de cadastro criou `validation.mobile-round1-20260904@invalid.test`; o log registrou `POST /api/auth/register 303` e o navegador foi redirecionado para `/?acompanhando=1&conta=criada`. Foi então inserido somente para esse teste o acompanhamento de `camara/2617687`:

| Registro temporário | UUID |
| --- | --- |
| Usuário | `7a8872de-aa7f-4559-b85a-1b7b51ade064` |
| Sessão | `33882fb8-caa2-4749-bbb7-d272b7a7567a` |
| Acompanhamento | `c654667f-9f9b-4e16-b6cd-0a1ab4a37825` |
| Projeto | `13d491d2-eb34-4b6f-b3c8-f8bb4c47c943` (`camara/2617687`) |

- Com o cookie dessa sessão e em `390x844`, `/?acompanhando=1` retornou `1 registros oficiais` e um link para `PL 1928/2026`; não havia `Próxima página` (`0` ocorrências), como esperado para `totalPages=1`. O log do servidor registrou `GET /?acompanhando=1 200`, `GET /seguindo 200` e `GET /api/follows 200` nessa sessão. A paginação com múltiplos resultados já foi acionada acima no mesmo viewport.
- A auditoria imediatamente antes da limpeza foi `users=1, sessions=1, followed_bills=1`. Foram apagados, nessa ordem e pelo e-mail/UUID temporário exato, o acompanhamento `c654667f-9f9b-4e16-b6cd-0a1ab4a37825`, a sessão `33882fb8-caa2-4749-bbb7-d272b7a7567a` e o usuário `7a8872de-aa7f-4559-b85a-1b7b51ade064`. A auditoria posterior foi `users=0, sessions=0, followed_bills=0`.

## Observações e limitações

- A consulta de atividade recente em 30 dias permanece correlacionada. A medição local de 387,523 ms não justificou materialização fora do escopo, mas o plano e o volume de buscas indexadas estão registrados acima para monitoramento.
- O navegador registrou apenas o aviso de desenvolvimento preexistente do Next.js sobre `scroll-behavior: smooth`; não houve erro funcional de aplicação durante o percurso final.
- Nenhuma conta foi criada na rodada final. As contas temporárias das rodadas anteriores já tinham sido removidas; não há credencial nem acompanhamento de validação remanescente no banco de desenvolvimento. O banco de testes foi truncado ao final (`bills=0`, `users=0`, `followed_bills=0`).
