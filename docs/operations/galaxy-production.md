# Operação do app no Galaxy

Este documento descreve o primeiro deploy e a carga histórica sem registrar credenciais. A credencial administrativa do Galaxy é usada somente no bootstrap local do banco e nunca é enviada ao Web App.

## Contrato do Web App

- Ambiente: **Production**, região `us-east-1`, Node 22 e um contêiner no menor tamanho que passar pelo gate de memória.
- Instalação: `npm ci`.
- Build: `npm run build`.
- Inicialização: `npm start`.
- Liveness usada pelo Galaxy: `/api/live`. Ela confirma somente que o processo HTTP está respondendo e não depende do PostgreSQL.
- Diagnóstico da aplicação: `/api/health`. Ele testa o acesso ao banco e informa se as fontes Câmara e Senado estão atualizadas.
- O coletor histórico roda no Mac local, não durante build, startup ou requisições do Web App.
- O custo exato por hora e por mês deve ser mostrado e confirmado pelo responsável imediatamente antes da criação do recurso pago.

Variáveis obrigatórias do Web App:

```text
NODE_ENV=production
DATABASE_URL=<application-connection-url>
CAMARA_BASE_URL=https://dadosabertos.camara.leg.br/api/v2
SENADO_BASE_URL=https://legis.senado.leg.br/dadosabertos
TSE_DATA_BASE_URL=https://cdn.tse.jus.br
LEGISLATIVE_HISTORY_START_YEAR=1946
ELECTION_YEAR=2026
GEO_PROVIDER=none
HTTP_TIMEOUT_MS=10000
HTTP_MAX_ATTEMPTS=3
HISTORICAL_DATABASE_CAPACITY_BYTES=30000000000
```

`OPENAI_API_KEY`, `OPENAI_MODEL`, `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` são opcionais. Sem OpenAI, o app mostra o título e a ementa oficiais; sem VAPID, notificações push não são ativadas.

## Bootstrap do PostgreSQL

1. Abra os detalhes de conexão do banco Galaxy autenticado e mantenha a URL administrativa apenas em memória local.
2. Inspecione os nomes e proprietários existentes antes de alterar qualquer objeto.
3. Gere uma senha aleatória para `pulse_app` localmente. Não a cole no terminal nem em documentação.
4. Execute `scripts/bootstrap-production-database.sql` com as variáveis psql `app_role`, `app_password` e `app_database`. O script reutiliza objetos compatíveis e interrompe caso encontre role privilegiada ou banco com outro proprietário.
5. Grave somente a URL da role de aplicação em `.env.production.local` e aplique permissão de arquivo `0600`.
6. Apague as variáveis administrativas e a senha isolada do shell assim que a URL da aplicação estiver salva.

Exemplo sem valores sensíveis:

```sh
psql <galaxy-admin-url> \
  --set=app_role=<application-role> \
  --set=app_password=<generated-password> \
  --set=app_database=<application-database> \
  --file=scripts/bootstrap-production-database.sql

node --env-file=.env.production.local ./node_modules/drizzle-kit/bin.cjs migrate
npx tsx --env-file=.env.production.local scripts/verify-production-database.ts
```

O verificador imprime apenas nomes do banco/usuário, condição de superusuário, quantidade de migrações, presença das tabelas e bytes utilizados. Ele nunca imprime a URL de conexão.

## Carga inicial e operação

Depois do deploy saudável, execute nesta ordem, sempre com `.env.production.local`: sincronismo legislativo atual, sincronismo eleitoral de 2026, uma unidade do coletor histórico e então o coletor contínuo. A prioridade é do ano mais recente para o mais antigo. O limite operacional é 60 requisições por minuto por fonte (uma requisição por segundo em cada fonte).

```sh
npx tsx --env-file=.env.production.local scripts/sync.ts
npx tsx --env-file=.env.production.local scripts/sync-election.ts
npx tsx --env-file=.env.production.local scripts/collect-history.ts --from=1946 --through=2026 --source=all --requests-per-minute=60 --once
npx tsx --env-file=.env.production.local scripts/collect-status.ts
npx tsx --env-file=.env.production.local scripts/collect-history.ts --from=1946 --through=2026 --source=all --requests-per-minute=60
```

O status de armazenamento muda para aviso em 70%, crítico em 80% e interrompe a reserva de novas páginas em 90%. Lotes já persistidos e cursores continuam válidos para uma retomada posterior.
