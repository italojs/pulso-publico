# Validação dos filtros avançados — 4 de setembro de 2026

## Ambiente e escopo

- Worktree: `.../.worktrees/advanced-filters`, branch `codex/advanced-filters`.
- Runtime: Node.js `v26.8.1`, npm `11.19.0`, Next.js `16.3.4` e PostgreSQL local em `127.0.0.1:5435`.
- Banco de desenvolvimento: `legislativo_codex_dev`; banco de testes: `legislativo_codex_test`.
- A aplicação de validação foi iniciada somente nesta tarefa em `http://localhost:3001` (`DATABASE_URL` apontando para o banco de desenvolvimento). A instância principal em `:3000` não foi interrompida.

## Migração e backfill

Comando executado:

```bash
PATH='/Users/italojose/.local/share/fnm/node-versions/v26.8.1/installation/bin':$PATH \
  DATABASE_URL='postgres://italojose@127.0.0.1:5435/legislativo_codex_dev' npm run db:migrate
```

Resultado: exit code `0`; `drizzle-kit migrate` concluiu com `migrations applied successfully!`. A migração `0003_advanced_filters.sql` é aditiva (`CREATE TYPE`, `ALTER TABLE ... ADD COLUMN`, `UPDATE` de backfill e `CREATE INDEX`); não contém `DELETE` de projetos, movimentações, votos ou resumos de IA. As contagens posteriores foram: 257.366 projetos, 18.398 movimentações, 908 eventos de votação e 0 resumos de IA.

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
| Projetos com tipo e ano extraídos | 123.871 |
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
| `PATH='/Users/italojose/.local/share/fnm/node-versions/v26.8.1/installation/bin':$PATH TEST_DATABASE_URL='postgres://italojose@127.0.0.1:5435/legislativo_codex_test' npm test` | exit `0`; 32 arquivos e 206 testes aprovados em 8,52 s. |
| `PATH='/Users/italojose/.local/share/fnm/node-versions/v26.8.1/installation/bin':$PATH npm run typecheck` | exit `0`; `tsc --noEmit` sem diagnósticos. |
| `PATH='/Users/italojose/.local/share/fnm/node-versions/v26.8.1/installation/bin':$PATH DATABASE_URL='postgres://italojose@127.0.0.1:5435/legislativo_codex_dev' npm run build` | exit `0`; compilação em 287 ms, TypeScript em 230 ms e 15/15 páginas estáticas geradas. |

## Percurso manual reproduzível

Foi usada automação real do navegador embutido com árvore de acessibilidade e uma captura visual do painel móvel. Não foram gravados arquivos de screenshot persistentes.

### Desktop — 1280 × 720

- Em `http://localhost:3001/`, o painel abriu e fechou por `Escape`; após o fechamento o foco voltou para o botão `Filtros avançados`.
- Os sete grupos semânticos estavam disponíveis: identificação; tramitação; datas/atividade; votações; autoria/representação; acompanhamento; ordenação. Visualmente, a implementação os agrupa em cinco headings: **Identificação**, **Tramitação** (também datas/atividade), **Votações**, **Autoria e representação** (também acompanhamento) e **Ordem dos resultados**.
- Foram selecionados `PEC` e `PL` no mesmo grupo e `Saúde` em outro. A prévia exibiu `157 projetos encontrados`; ao aplicar, a URL foi `/?tipo=PEC&tipo=PL&tema=Sa%C3%BAde&...&ordem=updated` e os resultados foram 157. Isso demonstra OU no grupo de tipo e E com o tema.
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

- O painel abriu com `dialog.open=true`, `position: fixed` e retângulo `390x844`. `Escape` o fechou e o foco retornou a `Filtros avançados`.
- Foram marcados `PEC` e `PL` (mesmo campo) e `Saúde` (outro campo). A prévia exibiu `157 projetos encontrados`; o envio resultou em `/?tipo=PEC&tipo=PL&tema=Sa%C3%BAde&numero=&anoInicio=&anoFim=&apresentadaInicio=&apresentadaFim=&atividadeRecente=&atividadeInicio=&atividadeFim=&ordem=updated`, com `157 registros oficiais`. Isso confirma OU entre os dois tipos e E com o tema também no viewport móvel.
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

- A submissão nativa do formulário avançado incluiu alguns parâmetros vazios no primeiro URL aplicado (`numero=`, `anoInicio=`, `anoFim=`, `apresentadaInicio=`, `apresentadaFim=`, `atividadeRecente=`, `atividadeInicio=`, `atividadeFim=`). O parser os ignora e os links de etiquetas/paginação serializam somente valores ativos; o comportamento de filtro não mudou, mas o primeiro URL fica menos conciso.
- A apresentação visual consolida os sete grupos funcionais em cinco headings: datas/atividade fica em **Tramitação** e acompanhamento em **Autoria e representação**. Todos os controles dos sete grupos especificados estavam presentes; trata-se de agrupamento visual, não de ausência de controle.
- A conta temporária foi removida; portanto não há credencial nem acompanhamento de validação remanescente no banco de desenvolvimento.
