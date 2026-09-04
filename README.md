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
- Itens seguidos são salvos no dispositivo enquanto o usuário estiver anônimo e unidos de forma idempotente à conta no primeiro acesso autenticado.
- Senhas usam `scrypt`; tokens de sessão ficam em cookie `HttpOnly` e somente seus hashes são armazenados.

As decisões de produto e a arquitetura estão em [`docs/superpowers/specs`](docs/superpowers/specs). O relatório da validação mais recente está em [`docs/validation/2026-09-03-mvp-validation.md`](docs/validation/2026-09-03-mvp-validation.md).
