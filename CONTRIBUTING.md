# Como contribuir

Contribuições de código, testes, documentação, acessibilidade e correção de dados são bem-vindas. O objetivo é tornar informação pública compreensível e verificável, sem avaliações partidárias ou recomendação eleitoral. Ao participar, observe o [código de conduta](CODE_OF_CONDUCT.md).

## Antes de começar

Consulte o [README](README.md), o [guia de desenvolvimento](docs/development.md), a [arquitetura](docs/architecture.md) e o [roadmap](ROADMAP.md). Para mudanças grandes de produto, dados ou infraestrutura, abra uma issue descrevendo o problema e a proposta antes de implementar. Correções pequenas podem chegar diretamente em um pull request.

Em relatos de bugs, informe comportamento esperado e observado, passos para reproduzir, versões de Node/npm e ambiente. Prefira a demo e dados sintéticos. Não anexe `.env`, URLs de banco com credenciais, tokens, dumps, CPFs, emails de usuários ou linhas eleitorais brutas. Vulnerabilidades usam o [canal privado](SECURITY.md), não issues públicas.

## Fluxo de trabalho

1. Faça um fork, prepare o ambiente local e crie uma branch descritiva.
2. Mantenha a alteração focada no problema; preserve mudanças locais e contratos existentes.
3. Acrescente testes de regressão para comportamentos alterados e fixtures pequenas, fictícias ou sanitizadas. Testes não devem depender de APIs reais nem de um banco de produção.
4. Atualize a documentação quando mudar configuração, comandos, contratos ou limites conhecidos.
5. Execute `npm test`, `npm run typecheck` e `npm run build` no ambiente documentado.
6. Abra um pull request explicando motivação, resultado, verificações realizadas e riscos ou migrações necessárias. Para UI, inclua capturas sem dados pessoais.

Os testes usam dois bancos locais descartáveis: `TEST_DATABASE_URL` exige `_test` (pode truncar tabelas), e `DEMO_TEST_DATABASE_URL` exige `_test_demo` (migra, semeia e altera exemplos). Configure ambos se usar PostgreSQL personalizado; veja [o guia](docs/development.md#testes-e-build). O seed interativo exige um banco `_demo` local; essas proteções não tornam comandos administrativos ou migrações seguros para qualquer destino. Confira sempre o banco antes de executar comandos de escrita.

## Critérios de revisão

- Fatos devem continuar vinculados à origem oficial, com ausência de informação distinta de valor zero.
- Câmara e Senado, situações oficiais e datas não devem ser fundidos ou reinterpretados sem evidência.
- Alterações de IA precisam manter geração opcional, linguagem neutra e separação entre explicação e registro oficial.
- Conta, acompanhamentos e notificações devem respeitar isolamento entre usuários e consentimento.
- Mudanças de banco devem incluir migrações revisáveis e explicar compatibilidade e operação.
- Dependências e mídia novas precisam de origem e licença identificadas; atualize [avisos de terceiros](docs/third-party-notices.md).

O mantenedor revisa as propostas e pode pedir ajustes ou recusar mudanças incompatíveis com o escopo. Não há prazo garantido de revisão ou aceitação automática por aprovação dos checks. Novas contribuições originais entram sob a [licença MIT](LICENSE) do projeto; não envie material cuja licença você não possa conceder.

## Proteção da branch principal

Contribuições para `main` exigem branch atualizada, checks `quality` e `secret-scan`, uma aprovação e revisão de CODEOWNERS, além de conversas resolvidas. O repositório usa squash merge e histórico linear; force push e exclusão da branch estão desabilitados.

O administrador mantém uma exceção de revisão/checks enquanto houver somente um mantenedor, para evitar bloqueio por impossibilidade de aprovar seu próprio PR. Não use essa exceção como fluxo habitual para contribuições externas. Reavalie a configuração quando houver outros mantenedores; as regras efetivas são as configuradas no GitHub.
