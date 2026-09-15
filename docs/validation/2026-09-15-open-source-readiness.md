# Preparação open source — 2026-09-15

## Escopo e isolamento

Preparação do Pulso Público `0.1.0` como MVP open source sob MIT. As verificações foram realizadas em uma cópia limpa do commit-base `277633b685da4b8829d6a07746c0fbbed4193670`, acrescida somente dos arquivos desta preparação, sem `.env` local. Três alterações preexistentes em filtros e testes ficaram fora da cópia e do commit.

Nenhuma conexão, migração ou sincronização foi feita em banco de produção. A primeira rodada local usou PostgreSQL 16 pelo PATH do computador. Após conferir o ambiente do CI, a suite final foi repetida num cluster novo PostgreSQL `18.4`, chamado por caminho explícito, com bancos UTF-8 descartáveis `legislativo_test` e `legislativo_test_demo` em loopback e fuso UTC. A demo de exploração foi validada separadamente em `legislativo_demo`. A configuração Docker foi inspecionada; Docker Compose não foi executado localmente porque o CLI Docker não estava disponível.

## Verificações locais

| Verificação | Resultado |
| --- | --- |
| Node/npm fixados | Node `22.23.2`, npm `11.19.0` |
| Instalação limpa | `npm ci` concluído |
| Testes | 77 arquivos, 776 testes aprovados no PostgreSQL 18.4, com processo e bancos em UTC |
| Tipos | `npm run typecheck` aprovado |
| Build | `npm run build` aprovado; artefato Next.js standalone gerado |
| Demo | Migrações aplicadas em banco novo; seed repetido sem duplicar três projetos e dois parlamentares |
| Browser | Feed e detalhe sintéticos renderizados no servidor standalone, sem erros de página; requests externos bloqueados durante a captura |
| Automação | `actionlint` aprovado; YAML dos workflows e templates analisado |
| Documentação | Links locais, âncoras e referências aos scripts conferidos |
| Revisão independente | Revisão estática de implementação e configuração sem achados acionáveis |

Os testes novos cobrem validação antes de conectar, mensagens sem credenciais, destinos exclusivos `_test`/`_demo`/`_test_demo`, idempotência e apresentação fictícia. O CLI de demo recusa destino ausente, remoto e `NODE_ENV=production`. A proteção offline dos detalhes foi também verificada por mutação: removê-la causou falha de regressão com tentativa de request; restaurá-la fez o teste passar.

A revisão final encontrou uma exceção mal documentada: a regressão da demo também escreve em banco. Ela foi separada do banco de exploração e agora exige `_test_demo`, com default `legislativo_test_demo` e override `DEMO_TEST_DATABASE_URL`. Docker, CI e guias foram alinhados; um teste adicional recusa o destino de demo interativa. A suite completa, tipos e build foram repetidos com sucesso após a correção; a revisão independente confirmou sua resolução.

## Segredos, dependências e licenças

Gitleaks `8.30.1`, obtido da release oficial com checksum verificado, examinou o histórico completo com saída redigida: 144 commits no histórico-base, 143 patches não vazios, sem segredos detectados. O pacote publicável foi examinado separadamente, excluindo artefatos de instalação/build e arquivos ignorados. Ausência de achados não prova ausência absoluta de segredos.

`npm audit --omit=dev`: zero vulnerabilidades encontradas. A auditoria completa mantém quatro alertas moderados herdados na cadeia Drizzle Kit/esbuild; veja [SECURITY.md](../../SECURITY.md#limitação-conhecida-do-toolchain). Não foi aplicado downgrade incompatível nem `audit fix --force`.

Licenças das dependências diretas e componentes transitivos relevantes foram inventariadas em [avisos de terceiros](../third-party-notices.md). A MIT não relicencia dados oficiais, mídia, fontes ou dependências, e o inventário não é parecer jurídico.

## Publicação e verificações externas

O repositório [italojs/pulso-publico](https://github.com/italojs/pulso-publico) foi publicado como público, com histórico preservado e MIT reconhecida pelo GitHub. Issues, Discussions, alertas/atualizações de segurança Dependabot, secret scanning, push protection e relato privado de vulnerabilidades foram ativados e conferidos por API. A permissão padrão dos tokens de workflow é somente leitura, sem aprovação de PRs.

A [primeira varredura de segredos no GitHub](https://github.com/italojs/pulso-publico/actions/runs/34979040384) passou. O [primeiro CI](https://github.com/italojs/pulso-publico/actions/runs/34979040403) passou na instalação, PostgreSQL 18, auditoria de produção e tipos, mas encontrou um teste herdado de limite de data falhando em UTC. A causa foi reproduzida localmente: `date AT TIME ZONE` escolhia conversão implícita dependente do fuso da sessão. A correção explicita `date::timestamp AT TIME ZONE 'America/Sao_Paulo'`, inclusive para o próximo dia, sem alterar os três arquivos preexistentes.

Três regressões novas verificam lista e contagem nos instantes antes/primeiro/último/depois do dia brasileiro, sob UTC, São Paulo e Tóquio. Antes da correção, UTC e Tóquio falharam; depois, os 47 testes originais de consultas e as três regressões passaram. A suite final de 776 testes também passou em PostgreSQL 18/UTC. Actions foram atualizadas para releases oficiais que usam Node 24, fixadas por SHA completo, eliminando a dependência do runtime Node 20 depreciado.

O CI do commit corrigido, a proteção de `main` e a release devem ser conferidos nos [registros atuais do GitHub](https://github.com/italojs/pulso-publico/actions). Este relatório é um registro de verificações, não certificação de segurança, completude dos dados ou estabilidade do MVP.
