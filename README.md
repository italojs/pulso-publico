# Pulso Público

MVP de acompanhamento da atividade legislativa federal brasileira, com dados oficiais da Câmara dos Deputados e do Senado Federal apresentados em linguagem acessível.

O aplicativo oferece feed com busca e filtros, página completa de projeto com linha do tempo e votações, perfil neutro de parlamentar, acompanhamento sem cadastro e alertas opcionais com conta. Somente o título amigável e a descrição curta podem ser gerados por IA; todos os demais fatos permanecem vinculados à fonte oficial.

## Requisitos

- Node.js 26.8.1 (`.node-version` e `.nvmrc`);
- npm 11;
- PostgreSQL 18, local ou via Docker;
- cerca de 2 GB livres para uma carga local móvel de 36 meses, com folga para índices e crescimento.

## Início rápido

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run sync
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
npm run reconcile -- --source=all
npm run summaries -- 20
npm run alerts:dispatch
```

- `sync`: atualização incremental das duas casas e tentativa de entrega de push;
- `reconcile`: reconciliação diária da janela oficial do dia anterior;
- `summaries`: geração opcional em lote, ignorada com segurança sem chave;
- `alerts:dispatch`: reenvio dos pushes pendentes, também inofensivo sem VAPID.

Para produção, execute `npm run build` e `npm start`. Agende `npm run sync` a cada 30 minutos e `npm run reconcile -- --source=all` uma vez ao dia. Ambos usam advisory lock no PostgreSQL para impedir execuções concorrentes.

## Dados e privacidade

- A carga local inicial usa uma janela móvel de 36 meses (`INITIAL_HISTORY_MONTHS=36`).
- Documentos e anexos permanecem nas fontes oficiais; o banco guarda dados estruturados e links.
- Seguir projetos ou parlamentares exige uma conta. Acompanhamentos antigos que ainda estejam salvos no navegador são migrados de forma idempotente no primeiro acesso autenticado e, depois, removidos do armazenamento local.
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
