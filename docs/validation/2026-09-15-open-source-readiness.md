# Preparação open source — 2026-09-15

## Escopo e isolamento

Preparação do Pulso Público `0.1.0` como MVP open source sob MIT. As verificações foram realizadas em uma cópia limpa do commit-base `277633b685da4b8829d6a07746c0fbbed4193670`, acrescida somente dos arquivos desta preparação, sem `.env` local. Três alterações preexistentes em filtros e testes ficaram fora da cópia e do commit.

Nenhuma conexão, migração ou sincronização foi feita em banco de produção. PostgreSQL `18.4`, inicializado temporariamente em loopback, serviu bancos UTF-8 separados `legislativo_test`, `legislativo_demo` e `legislativo_test_demo`. A configuração Docker foi inspecionada; Docker Compose não foi executado localmente porque o CLI Docker não estava disponível.

## Verificações locais

| Verificação | Resultado |
| --- | --- |
| Node/npm fixados | Node `22.23.2`, npm `11.19.0` |
| Instalação limpa | `npm ci` concluído |
| Testes | 76 arquivos, 773 testes aprovados |
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

As evidências acima são locais. A criação do repositório, checks GitHub Actions, proteção de `main`, recursos de segurança e release devem ser conferidos nos respectivos registros do GitHub após o push; este relatório não substitui seus resultados nem certifica segurança, completude dos dados ou estabilidade do MVP.
