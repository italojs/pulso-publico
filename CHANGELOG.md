# Changelog

Mudanças relevantes do Pulso Público. A versão `0.1.0` é a base MVP; não indica estabilidade de API, cobertura histórica completa ou recomendação eleitoral.

## 0.1.0 — 2026-09-15

### Base do MVP

- Acompanhamento da atividade legislativa federal com fontes Câmara e Senado, feed, filtros avançados e paginação.
- Projetos com linha do tempo, relação bicameral conservadora e votações/votos individuais conforme disponibilidade oficial.
- Perfis de parlamentares, autenticação, acompanhamentos isolados por conta e alertas; Web Push opcional.
- Catálogo oficial de candidaturas de 2026, perfis, comparação neutra e vínculos com mandatos sujeitos a revisão.
- Sincronização incremental, reconciliação, importação histórica retomável e publicação atômica do retrato eleitoral.
- Explicações opcionais de IA para título amigável, descrição curta e impacto prático, preservando os dados oficiais.

### Preparação open source

- Licença MIT para o código original, documentação pública de desenvolvimento, dados, arquitetura e deploy.
- Políticas de contribuição, conduta e relato privado de vulnerabilidades.
- Demo sintética aditiva e idempotente, sem contas predefinidas, IA ou consulta às fontes oficiais.
- Proteções que restringem testes a bancos descartáveis locais `_test` e `_test_demo`, separados da demo de exploração; seed interativo somente em banco local `_demo`.
- Automação de qualidade e varredura de segredos, metadados do repositório e avisos de licenças de terceiros.
- Correção dos limites de datas brasileiras para não depender do fuso da sessão PostgreSQL, com regressões em UTC, São Paulo e Tóquio.

Relatórios de validações anteriores permanecem em [`docs/validation`](docs/validation) e [`docs/superpowers/validation`](docs/superpowers/validation). A documentação de decisões e planos também é preservada; não deve ser confundida com garantia de que todos os passos históricos foram executados.
