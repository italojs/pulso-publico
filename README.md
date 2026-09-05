# Pulso Público

MVP de acompanhamento da atividade legislativa federal brasileira, com dados oficiais da Câmara dos Deputados e do Senado Federal apresentados em linguagem acessível.

O aplicativo oferece feed com busca e filtros, página completa de projeto com linha do tempo e votações, perfis neutros de parlamentares e candidaturas, comparação de candidaturas e acompanhamento vinculado a uma conta. Somente o título amigável e a descrição curta podem ser gerados por IA; todos os demais fatos permanecem vinculados à fonte oficial.

## Requisitos

- Node.js 26.8.1 (`.node-version` e `.nvmrc`);
- npm 11;
- PostgreSQL 18, local ou via Docker;
- cerca de 2 GB livres para a carga legislativa móvel de 36 meses e ao menos 10 GB adicionais para sincronizar e manter a mídia eleitoral de 2026 com folga para a geração atômica seguinte.

## Início rápido

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run sync
npm run sync:election
npm run dev
```

Abra `http://localhost:3000`. O PostgreSQL do `docker-compose.yml` fica exposto em `127.0.0.1:5435`, como configurado no `.env.example`.

Nenhuma chave externa é necessária para navegar, seguir itens, criar uma conta ou receber alertas dentro do aplicativo. Quando você quiser ativar os recursos opcionais, preencha no `.env`:

- `OPENAI_API_KEY` e `OPENAI_MODEL`: títulos e descrições curtas em linguagem simples;
- `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: notificações Web Push.

## Comandos

```bash
npm test
npm run typecheck
npm run build
npm run sync
npm run sync:election
npm run reconcile -- --source=all
npm run summaries -- 20
npm run alerts:dispatch
```

- `sync`: atualização incremental das duas casas e tentativa de entrega de push;
- `sync:election`: retrato completo e atômico das candidaturas de 2026 a partir dos arquivos oficiais do TSE;
- `reconcile`: reconciliação diária da janela oficial do dia anterior;
- `summaries`: geração opcional em lote, ignorada com segurança sem chave;
- `alerts:dispatch`: reenvio dos pushes pendentes, também inofensivo sem VAPID.

Para produção, execute `npm run build` e `npm start`. Agende `npm run sync` a cada 30 minutos e `npm run reconcile -- --source=all` uma vez ao dia. A página oficial de estatísticas eleitorais informa quatro atualizações diárias para os conjuntos de 2026; programe `npm run sync:election` depois dessas janelas conforme a capacidade de rede e armazenamento. Os sincronizadores usam advisory lock no PostgreSQL para impedir execuções concorrentes.

O sincronizador eleitoral baixa os seis recursos tabulares de candidaturas, complementos, bens, coligações, redes sociais e prestação de contas, além dos 84 arquivos regionais de fotos, propostas de governo e certidões (Brasil e 27 unidades federativas para cada tipo de mídia). A carga real validada em setembro de 2026 transferiu aproximadamente 3,5 GB de arquivos compactados. `ELECTORAL_MEDIA_DIRECTORY` é resolvido como caminho absoluto na inicialização e precisa apontar para um volume persistente em produção. A aplicação só troca o retrato público depois que toda a carga foi validada; uma falha preserva o último retrato e sua geração de mídia. O TSE não exige chave de API.

As consultas públicas usam exclusivamente a geração do último sincronismo eleitoral bem-sucedido. Verifique os horários de extração e conferência exibidos nas telas e monitore falhas do job: enquanto a fonte estiver indisponível ou uma carga for rejeitada, o retrato anterior continua íntegro, mas fica naturalmente mais antigo. Antes da primeira carga, aplique `npm run db:migrate` e confirme espaço suficiente tanto para a geração publicada quanto para a próxima geração em staging.

Vínculos sugeridos entre candidatura e mandato permanecem pendentes e não aparecem publicamente até revisão explícita. O operador confirma ou rejeita uma correspondência usando somente identificadores públicos e uma evidência oficial:

```bash
npm run candidates:link -- confirm --year=2026 --candidate=260001234567 --source=camara --lawmaker=220530 --evidence=https://dadosabertos.camara.leg.br/api/v2/deputados/220530
npm run candidates:link -- reject --year=2026 --candidate=260001234567 --source=camara --lawmaker=220530 --evidence=https://dadosabertos.tse.jus.br/dataset/candidatos-2026
```

Os comandos imprimem apenas um resultado JSON sanitizado; nenhuma linha bruta do TSE é exibida. Nesta entrega, apenas `ELECTION_YEAR=2026` é aceito em execução. Use `GEO_PROVIDER=none` em desenvolvimento local.

## Catálogo de candidaturas

- `/candidatos` lista o retrato nacional de 2026 com busca, filtros rápidos e avançados, chips removíveis e paginação. `GEO_PROVIDER=cloudflare` ou `vercel` pode sugerir uma UF em produção; `none` mantém Brasil inteiro e é obrigatório para o comportamento previsível em desenvolvimento local.
- `/candidatos/2026/<id público do TSE>` abre o dossiê neutro com foto ou fallback, situação, bens, finanças, redes, proposta, certidões e proveniência oficial. Valor zero é preservado como zero; campo ausente continua “não informado”.
- `/candidatos/comparar?candidato=2026:<id>&candidato=2026:<id>` compara até três candidaturas compatíveis. A seleção pode atravessar páginas do catálogo; a tela apresenta fatos lado a lado, sem nota, ranking ou recomendação de voto.
- O botão **Seguir candidatura** exige sessão e redireciona visitantes para entrar ou criar conta com o retorno preservado. Acompanhamentos são exclusivos da conta autenticada, aparecem em `/seguindo` e nunca são compartilhados com outra conta.

O histórico legislativo no perfil só aparece para vínculos revisados e confirmados pelo operador. Sugestões pendentes e rejeições permanecem privadas e não alteram o catálogo público.

## Dados e privacidade

- A carga local inicial usa uma janela móvel de 36 meses (`INITIAL_HISTORY_MONTHS=36`).
- Documentos e anexos permanecem nas fontes oficiais; o banco guarda dados estruturados e links.
- Seguir projetos, parlamentares ou candidaturas exige uma conta. Acompanhamentos antigos de projetos ou parlamentares que ainda estejam salvos no navegador são migrados de forma idempotente no primeiro acesso autenticado e, depois, removidos do armazenamento local.
- Senhas usam `scrypt`; tokens de sessão ficam em cookie `HttpOnly` e somente seus hashes são armazenados.

## Filtros avançados do feed

Além da busca e dos filtros rápidos, o botão **Filtros avançados** abre um painel com sete seções recolhíveis: identificação; tramitação; datas e atividade; votações; assuntos e autoria; acompanhamento; e ordenação. Tipos, situações, temas, autoria e partidos têm busca com sugestões limitadas, para que os catálogos oficiais grandes não sejam renderizados integralmente. Valores de um mesmo campo são alternativas (por exemplo, `PEC` **ou** `PL`); campos diferentes são combinados entre si (por exemplo, tipo **e** tema).

Os filtros que podem ser compartilhados ficam na URL. Seleções múltiplas usam parâmetros repetidos, como `/?tipo=PEC&tipo=PL&tema=Saúde&tema=Trabalho`; intervalos usam, por exemplo, `anoInicio=2024&anoFim=2026` e `apresentadaInicio=2024-01-01`. Alterar um filtro volta à primeira página, preserva as demais seleções e omite parâmetros vazios. Se uma opção selecionada sair do catálogo sincronizado, ela continua visível como indisponível até ser removida explicitamente.

Para tornar a busca rápida, o banco normaliza facetas sem alterar os textos oficiais: tipo, número e ano da proposta; uma fase geral determinística da tramitação; e uma categoria de resultado de votação (`aprovada`, `rejeitada`, `outros` ou `não informado`). Siglas oficiais compostas por segmentos alfabéticos separados por hífen, ponto ou sublinhado — como `SBT-A`, `R.C` e `ATA_PRE` — são reconhecidas com limite de 20 caracteres. Uma sigla fora dessa gramática fica sem a faceta de tipo, mas o projeto e seu texto oficial são preservados e continuam pesquisáveis. A tela continua mostrando os títulos, situações e resultados oficiais quando eles existem.

“Mostrar somente projetos que acompanho” exige autenticação e é resolvido no servidor pelos acompanhamentos da conta. Para visitantes, o filtro fica desabilitado e leva à entrada ou criação de conta, preservando o endereço de retorno.

Todos os filtros usam exclusivamente dados oficiais já sincronizados da Câmara dos Deputados e do Senado Federal. Aplicar, contar ou combinar filtros não faz requisição de IA.

Após atualizar o código, aplique a migração aditiva antes de sincronizar ou consultar as novas facetas:

```bash
npm run db:migrate
```

As decisões de produto e a arquitetura estão em [`docs/superpowers/specs`](docs/superpowers/specs). O relatório da validação mais recente dos filtros está em [`docs/validation/2026-09-04-filtros-avancados-validation.md`](docs/validation/2026-09-04-filtros-avancados-validation.md); a validação de base do MVP permanece em [`docs/validation/2026-09-03-mvp-validation.md`](docs/validation/2026-09-03-mvp-validation.md).
