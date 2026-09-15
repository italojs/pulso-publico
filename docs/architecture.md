# Arquitetura

O Pulso Público é uma aplicação Next.js com App Router, React e TypeScript, apoiada por PostgreSQL e Drizzle. O processo web serve a interface e as rotas HTTP; scripts separados executam sincronizações e outras tarefas operacionais. O build é `standalone`, sem exigir um provedor de hospedagem específico.

## Organização do código

| Local | Responsabilidade |
| --- | --- |
| `app/` | Páginas, layouts e rotas HTTP de autenticação, busca, acompanhamentos, alertas e mídia. |
| `src/ui/` | Componentes da interface, filtros, cartões, perfis e comparação. |
| `src/domain/` | Contratos e normalizações de informação legislativa, eleitoral e histórica. |
| `src/integrations/` | Clientes e mapeadores das fontes oficiais Câmara, Senado e TSE. |
| `src/server/` | Configuração, banco, repositórios, consultas públicas, hidratação e integração de serviços. |
| `src/jobs/` e `scripts/` | Sincronização, reconciliação, histórico, IA e envio de push, executados pelo operador. |
| `src/auth/`, `src/follows/`, `src/alerts/` | Sessões, acompanhamentos e notificações vinculados à conta. |
| `src/development/` | Validação de destinos locais descartáveis e geração de exemplos sintéticos. |
| `drizzle/` e `tests/` | Migrações versionadas e testes unitários, de interface e de integração. |

## Caminho dos dados

```text
Fontes oficiais → clientes e mapeadores → jobs/repositórios → PostgreSQL
                                                              ↓
                                              consultas públicas → páginas/UI
```

O feed consulta dados já persistidos; aplicar filtros não chama IA nem sincroniza fontes. Facetas normalizadas aceleram a consulta sem sobrescrever títulos e situações oficiais. Filtros compartilháveis ficam na URL; condições pessoais, como “somente projetos que acompanho”, são resolvidas no servidor para a conta autenticada.

Ao abrir um projeto real, o servidor pode complementar seus detalhes diretamente na fonte, armazenando tramitações, autoria, temas, votações e votos disponíveis. Estado de hidratação, intervalos de atualização, retentativas e advisory locks evitam repetir trabalho concorrente no mesmo projeto. Isso não elimina a dependência de disponibilidade externa. Projetos `demo-NNN` em banco local `_demo` não passam pela hidratação oficial.

Matérias das duas Casas só são relacionadas com identificação oficial e evidência de origem na outra Casa. Câmara e Senado permanecem separados, inclusive em grupos de votação. O histórico amplo usa tarefas e cursores persistidos, com retomada e controle de armazenamento; não roda automaticamente no startup ou build.

## Retrato eleitoral

A ingestão do TSE reúne recursos tabulares e mídia em uma nova geração, confere contratos e metadados e publica o retrato de forma atômica. As consultas públicas usam a geração do último sincronismo bem-sucedido. Se uma carga falhar, a anterior continua visível e sua idade deve ser observada pelo operador.

Sugestões de correspondência entre candidatura e parlamentar são pendentes e privadas até confirmação explícita com evidência oficial. A comparação apresenta fatos de até três candidaturas compatíveis, sem pontuação ou recomendação.

## Conta, IA e notificações

Senhas são derivadas com `scrypt`. Tokens aleatórios de sessão ficam em cookie `HttpOnly`, com `SameSite=Lax` e `Secure` quando aplicável; o banco armazena seus hashes. Repositórios de acompanhamentos e alertas usam a conta autenticada, não um estado público compartilhado. A migração de acompanhamentos antigos do navegador é idempotente e remove o estado local migrado.

A IA é um enriquecimento separado: mantém modelo, versão do prompt, fingerprint da entrada e data de geração. A saída validada inclui título amigável, descrição curta e impacto prático opcional. A validação estrutural não comprova exatidão semântica. Sem configuração ou saída disponível, a interface conserva os textos oficiais.

Web Push exige configuração VAPID e adesão do usuário; alertas dentro do aplicativo não dependem dela. O dispatch é um job separado, também acionado no sincronismo incremental quando configurado.

Consulte [dados e IA](data-and-ai.md), [desenvolvimento](development.md) e [deploy](deployment.md). Decisões detalhadas e contexto histórico permanecem em [`superpowers/specs`](superpowers/specs) e [`superpowers/plans`](superpowers/plans); o código e os testes atuais são a referência para o comportamento entregue.
