# Deploy

O Pulso Público pode ser hospedado em um ambiente Node.js com PostgreSQL, sem contratação obrigatória de um provedor específico. Este guia descreve o contrato do aplicativo, não um provisionamento automático ou uma garantia de prontidão de qualquer instância.

## Requisitos e responsabilidades

Use Node.js `22.23.2`, npm `11.19.0` e PostgreSQL `18`. Providencie banco, rede privada ou acesso restrito, TLS, backups testados e armazenamento compatível com os jobs escolhidos. Credenciais locais `app:app` são apenas exemplos de desenvolvimento. Separe a role administrativa da role do aplicativo e conceda somente os privilégios necessários.

O operador deve aplicar migrações antes de iniciar a nova versão, monitorar o processo web e os jobs, avaliar privacidade e licenças de dados/mídia e aprovar custos de serviços externos. O repositório não cria recursos pagos por padrão. Não use demo ou banco de testes em produção.

## Build e processo web

```bash
nvm install
nvm use
npm install --global npm@11.19.0
npm ci
npm run build
```

Configure as variáveis necessárias ao build por um mecanismo reservado, incluindo `DATABASE_URL` quando exigida pela configuração. Não coloque credenciais nos comandos compartilhados, imagens públicas ou arquivos versionados. Se usar Web Push, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` deve estar definida no build; apenas essa chave é pública.

O build Next.js gera `.next/standalone`; o script de preparação inclui `public` e `.next/static`. Gere o artefato para a plataforma/arquitetura de destino, preservando os avisos de bibliotecas e binários efetivamente distribuídos. Veja [avisos de terceiros](third-party-notices.md).

Antes da inicialização, o operador executa `npm run db:migrate` no ambiente de migração com a `DATABASE_URL` correta e acesso ao código/migrações. A aplicação não migra o banco automaticamente no startup. Depois, configure o ambiente de execução e inicie:

```bash
npm start
```

Esse script executa o servidor Node standalone com `HOSTNAME=0.0.0.0`. `PORT` pode ser fornecida pelo ambiente de hospedagem. A `DATABASE_URL` precisa estar disponível no processo em runtime, não apenas durante o build; forneça variáveis explicitamente pelo serviço de hospedagem ou supervisor e não dependa de um `.env` de desenvolvimento no artefato.

Mantenha o Node atrás de reverse proxy com TLS, domínio e encaminhamento de origem/protocolo corretos. Acesso público ao PostgreSQL não é necessário. Não use o servidor `npm run dev` para servir produção.

## Configuração

`DATABASE_URL` é obrigatória. Defina `NODE_ENV=production`; os demais padrões de fontes estão em `.env.example`. `GEO_PROVIDER=none` é a opção independente de provedor. Se optar por `cloudflare` ou `vercel`, configure os cabeçalhos e a cadeia de confiança desse ambiente para a sugestão regional.

IA exige `OPENAI_API_KEY` e `OPENAI_MODEL`, com endpoint opcional `OPENAI_BASE_URL`. Web Push exige VAPID. Sem essas configurações, o app continua usando dados oficiais e alertas internos, sem esses serviços opcionais. Guarde segredos fora do repositório.

Para ingestão eleitoral, configure `ELECTORAL_MEDIA_DIRECTORY` em um volume persistente que o job e o processo web consigam usar conforme o armazenamento adotado. A ingestão precisa de espaço para a geração atual e a próxima; não grave mídia apenas no filesystem efêmero de uma instância. A execução suporta somente `ELECTION_YEAR=2026`.

## Jobs externos e carga inicial

O servidor web não executa cargas completas no build ou startup. Um banco vazio permite iniciar, mas não apresenta catálogo preenchido. Após migrar, execute os jobs desejados em um processo externo com o ambiente e o banco da instância correta:

- `npm run sync`: atualização incremental; 30 minutos é um ponto inicial de agendamento, ajustado à capacidade e às fontes.
- `npm run reconcile -- --source=all`: reconciliação do dia anterior; pode ser agendada diariamente.
- `npm run sync:election`: carga eleitoral completa; agende conforme as janelas atuais do TSE, rede e disco, não a cada acesso de usuário.
- `npm run backfill:legislative -- --from=2019 --source=all` ou `collect:history`: histórico opcional, com supervisão, retomada e limites de requisição.
- `npm run summaries -- 100` e `npm run alerts:dispatch`: enriquecimento por IA e reenvio de push, quando configurados.

Agendamento deve ser feito pelo operador, com o scheduler da infraestrutura escolhida. Advisory locks reduzem concorrência no mesmo job, mas não dispensam monitoramento, dimensionamento ou validação dos destinos. O [guia de desenvolvimento](development.md#sincronização-opcional-de-dados-reais) detalha comandos, carga e armazenamento. Nenhuma dessas cargas é exigida para experimentar a demo local.

Os jobs npm dependem de `tsx`, que fica nas dependências de desenvolvimento, assim como as ferramentas de migração. Prepare um checkout operacional com `npm ci` completo para essas tarefas; o artefato web standalone não é, por si só, um pacote de todos os jobs. Quando necessário executar um script diretamente com arquivo de ambiente reservado, use `npx tsx --env-file=.env.production.local scripts/collect-status.ts`, em um ambiente onde as dependências já estejam instaladas, sem incluir credenciais no comando. Nunca mantenha esse arquivo no checkout de desenvolvimento ou no repositório público.

## Diagnóstico e atualização

`/api/live` confirma apenas que o processo HTTP responde e não depende do PostgreSQL. `/api/health` consulta o banco e apresenta a atualização de Câmara e Senado; pode indicar estado degradado num banco recém-criado ou com sincronização atrasada. Não interpreta a saúde do catálogo eleitoral inteiro nem substitui a inspeção dos jobs.

Monitore separadamente falhas de sincronização, idade do retrato eleitoral, armazenamento e entrega de push. Preserve logs sem segredos ou linhas pessoais brutas. Para atualizar, prepare backup recuperável, revise migrações e dependências, aplique a migração antes de servir a versão nova e confira liveness, banco e fluxos públicos. Não presuma que voltar o código desfaz uma migração de schema.

## Hospedagem opcional no Galaxy

O [runbook existente do Galaxy](operations/galaxy-production.md) registra um cenário específico de operação, bootstrap e histórico desde 1946. Ele é uma alternativa, não dependência do projeto nem recomendação de contratação. Região, tamanho, capacidade, intervalo histórico e custo precisam ser avaliados para cada instância; qualquer provisionamento pago exige decisão própria do responsável.
