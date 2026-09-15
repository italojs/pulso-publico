# Segurança

## Relatar uma vulnerabilidade

Use o [relato privado de vulnerabilidades do GitHub](https://github.com/italojs/pulso-publico/security/advisories/new). Não abra uma issue pública com detalhes de exploração, credenciais ou dados pessoais. Se a interface estiver indisponível, utilize um contato privado que o mantenedor disponibilize em [seu perfil](https://github.com/italojs). Se não houver esse contato, abra uma issue apenas pedindo um canal reservado, sem detalhes da vulnerabilidade ou identificação de pessoas.

Inclua a versão ou commit afetado, componente, impacto, pré-condições e passos mínimos de reprodução. Use contas fictícias e um ambiente local isolado. O relato não deve conter URLs de banco com senha, tokens ativos, CPFs, emails reais, dumps ou arquivos eleitorais brutos.

Não teste contas de terceiros, ambientes públicos ou produção sem autorização explícita do operador. Evite exploração destrutiva ou coleta de dados além do necessário para demonstrar o problema. Combine a divulgação pública com o mantenedor após a avaliação e, quando aplicável, a disponibilização de uma correção.

## Escopo e manutenção

A versão atual é `0.1.0`, um MVP. A avaliação de segurança se concentra na versão atual do código; não há compromisso de suporte a versões antigas, prazo de resposta, SLA ou programa de recompensa. Checks automatizados e testes ajudam a encontrar problemas, mas não constituem certificação de segurança.

O código do aplicativo, autenticação, isolamento de acompanhamentos, rotas públicas, ingestão de dados, execução de jobs e configuração fazem parte do escopo do projeto. Problemas nas fontes Câmara, Senado ou TSE devem também ser encaminhados ao respectivo responsável quando não forem causados pelo Pulso Público.

## Para operadores e colaboradores

- Mantenha segredos fora do Git e use variáveis de ambiente ou o mecanismo reservado de seu provedor.
- Nunca use credenciais locais `app:app` em produção. Separe permissões administrativas da conta do aplicativo.
- Use TLS, controle o acesso ao PostgreSQL e mantenha dependências e infraestrutura atualizadas.
- Testes aceitam somente bancos de loopback `_test` e `_test_demo`, ambos descartáveis e separados da demo de exploração; configure `TEST_DATABASE_URL` e `DEMO_TEST_DATABASE_URL` conforme [o guia](docs/development.md#testes-e-build). O seed aceita somente `_demo` local e não roda em produção. Não reutilize esses bancos para dados importantes.
- Não publique bancos de usuários, sessões, assinaturas de push, dumps de produção ou linhas brutas com identificadores pessoais.
- Se um segredo vazar, revogue ou rotacione primeiro; remover o arquivo da última revisão não o remove do histórico nem invalida a credencial.

Consulte [deploy](docs/deployment.md) e [dados e IA](docs/data-and-ai.md) para as responsabilidades de operação e privacidade.

## Limitação conhecida do toolchain

Em 2026-09-15, `npm audit --omit=dev` não encontrou vulnerabilidades. A auditoria completa apontou quatro alertas moderados na cadeia de desenvolvimento do Drizzle Kit, relacionados ao servidor de desenvolvimento do esbuild ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)). Isso não torna a aplicação certificada ou livre de outros problemas. O projeto não usa esse servidor esbuild para servir o aplicativo.

Não aplique `npm audit fix --force` indiscriminadamente: a solução automática sugerida para esse lockfile rebaixa o Drizzle Kit para uma versão incompatível. Acompanhe uma atualização compatível, revise o lockfile e repita testes, migrações e build. Não exponha servidores de ferramentas de desenvolvimento à rede pública.
