# Pulso Público

Projetos de lei sem juridiquês. Um MVP open source para acompanhar a atividade legislativa federal brasileira e consultar candidaturas de 2026 com dados oficiais, linguagem acessível e rastreabilidade.

O Pulso Público é um projeto independente: não representa a Câmara, o Senado ou o TSE, não atribui notas a políticos e não recomenda voto. A versão `0.1.0` é um MVP, não uma plataforma eleitoral estável ou uma garantia de cobertura completa.

## O que já funciona

- Feed de projetos com busca, filtros rápidos e avançados, ordenação e paginação.
- Detalhes de projetos, linha do tempo, votações e votos individuais quando disponibilizados pela fonte, mantendo Câmara e Senado separados.
- Perfis de parlamentares, contas, acompanhamentos e alertas no aplicativo; Web Push opcional.
- Catálogo de candidaturas de 2026, perfis e comparação de até três candidaturas compatíveis, sem ranking.
- IA opcional para título amigável, descrição curta e explicação de impacto prático, sem substituir os registros oficiais.

![Feed do Pulso Público com dados sintéticos de demonstração](docs/images/feed-demo.png)

Captura da aplicação com dados inteiramente fictícios de demonstração. Os projetos e parlamentares mostrados não representam registros oficiais nem pessoas reais.

## Início rápido

Requisitos: Git, [nvm](https://github.com/nvm-sh/nvm), Node.js `22.23.2`, npm `11.19.0` e Docker Compose para o PostgreSQL `18`. As versões de Node e npm estão registradas no repositório; confira `node --version` e `npm --version` antes de instalar.

```bash
git clone https://github.com/italojs/pulso-publico.git
cd pulso-publico
nvm install
nvm use
npm install --global npm@11.19.0
npm ci
cp .env.example .env
docker compose up -d --wait
npm run db:migrate
npm run dev
```

Abra [localhost:3000](http://localhost:3000). O exemplo de configuração usa `postgres://app:app@127.0.0.1:5435/legislativo`; essas credenciais são apenas para desenvolvimento local. O Docker expõe o PostgreSQL somente em `127.0.0.1:5435`.

Não é necessário cadastrar chave de IA, carregar todo o histórico ou baixar arquivos eleitorais para iniciar. Um banco recém-migrado tem feed vazio. Para explorar a interface sem consultar fontes externas, use a demo abaixo.

### Demo local, sem dados reais

O Docker cria `legislativo_demo`, `legislativo_test` e `legislativo_test_demo` apenas na primeira inicialização de um banco novo. Se seu contêiner já existia, consulte [o guia de desenvolvimento](docs/development.md#bancos-locais-e-contêineres-existentes) para criar os bancos ausentes sem apagar dados.

Depois de preparar o ambiente do início rápido, pare o servidor de desenvolvimento, se estiver ativo, e execute:

```bash
DATABASE_URL=postgres://app:app@127.0.0.1:5435/legislativo_demo npm run db:migrate
DEMO_DATABASE_URL=postgres://app:app@127.0.0.1:5435/legislativo_demo npm run db:seed:demo
DATABASE_URL=postgres://app:app@127.0.0.1:5435/legislativo_demo npm run dev
```

O seed acrescenta três projetos e dois parlamentares fictícios, temas e movimentações, sem apagar registros nem criar contas predefinidas. Pode ser executado novamente sem duplicar os exemplos. Não chama IA ou APIs oficiais. O CLI exige `DEMO_DATABASE_URL` explicitamente, aceita somente PostgreSQL de loopback com nome terminado em `_demo`, não lê `.env` nem usa `DATABASE_URL` como alternativa e recusa `NODE_ENV=production`.

A demo cobre o feed e detalhes legislativos; ainda não inclui candidaturas, finanças eleitorais ou exemplos de votações. Para experimentar acompanhamentos, crie sua própria conta local com dados fictícios.

## Verificação e dados opcionais

```bash
npm test
npm run typecheck
npm run build
```

Os testes usam dois bancos descartáveis, separados da demo de exploração: `legislativo_test` (pode ser truncado) e `legislativo_test_demo` (migrado, semeado e alterado pela regressão da demo). `TEST_DATABASE_URL` exige loopback e nome terminado em `_test`; `DEMO_TEST_DATABASE_URL` exige loopback e nome terminado em `_test_demo`. Ao usar PostgreSQL personalizado, configure os dois destinos. Nunca use bancos com dados que deseja preservar; veja [o guia de testes](docs/development.md#testes-e-build).

Para carregar registros reais em um banco de desenvolvimento escolhido conscientemente, comece por `npm run sync`. Cargas históricas e eleitorais são opcionais, exigem rede e podem consumir bastante tempo e armazenamento. A carga eleitoral completa validada em setembro de 2026 transferiu cerca de 3,5 GB compactados; o planejamento de disco deve considerar também extração e gerações simultâneas. Veja [comandos e operação de dados](docs/development.md#sincronização-opcional-de-dados-reais).

## Documentação e contribuição

- [Arquitetura](docs/architecture.md), [dados e IA](docs/data-and-ai.md).
- [Desenvolvimento](docs/development.md), [deploy independente](docs/deployment.md).
- [Como contribuir](CONTRIBUTING.md), [código de conduta](CODE_OF_CONDUCT.md), [segurança](SECURITY.md).
- [Roadmap](ROADMAP.md), [changelog](CHANGELOG.md), [avisos de terceiros](docs/third-party-notices.md).

Encontrou um erro comum ou tem uma sugestão? Abra uma [issue](https://github.com/italojs/pulso-publico/issues). Vulnerabilidades devem ser relatadas pelo [canal privado de segurança](https://github.com/italojs/pulso-publico/security/advisories/new), sem publicar segredos ou dados pessoais.

## Licença

O código original do projeto é distribuído sob [MIT](LICENSE), copyright 2026 Italo José. `private: true` em `package.json` evita publicação acidental no npm; não restringe o acesso público no GitHub nem o uso permitido pela licença.

Dados oficiais, fotografias, documentos, fontes tipográficas e dependências não são relicenciados pela MIT do projeto. Preserve os avisos aplicáveis e verifique as condições de cada origem antes de redistribuir dados ou mídia. Consulte [dados e IA](docs/data-and-ai.md) e [avisos de terceiros](docs/third-party-notices.md).
