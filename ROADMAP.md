# Roadmap

O Pulso Público está em `0.1.0`, um MVP de informação pública. Este documento expressa prioridades de evolução, não datas prometidas ou funcionalidades já entregues. Propostas concretas são discutidas nas [issues](https://github.com/italojs/pulso-publico/issues).

## Base disponível

O aplicativo já oferece feed e filtros legislativos, páginas de projetos com histórico e votações disponíveis, perfis de parlamentares, contas e acompanhamentos, alertas, Web Push opcional, catálogo eleitoral de 2026 e comparação de candidaturas. Títulos, descrições e impacto prático podem ter explicação opcional por IA. Consulte o [README](README.md) e [dados e IA](docs/data-and-ai.md) para os limites desses recursos.

## Prioridades

- Ampliar a cobertura e a conferência do histórico oficial, tornando lacunas e divergências mais fáceis de identificar.
- Melhorar observabilidade dos jobs, documentação de retomada e planejamento de armazenamento e custos.
- Expandir a demo sintética para candidaturas e votações, sem pessoas reais ou recomendações políticas.
- Reforçar testes de acessibilidade, navegação por teclado e clareza da interface em telas pequenas.
- Melhorar a revisão e a rastreabilidade das explicações de IA, mantendo o aplicativo plenamente utilizável sem elas.
- Evoluir os processos de contribuição, segurança, releases e atualização de dependências com base no uso real.

## Limites do MVP

A presença de um registro depende da ingestão e da disponibilidade da fonte; ausência no aplicativo não prova ausência de atividade. A atualização não é em tempo real garantido. Votos individuais dependem do que cada Casa disponibiliza, e vínculos entre candidaturas e mandatos só aparecem após revisão explícita. A execução eleitoral aceita somente `ELECTION_YEAR=2026`.

O primeiro banco é vazio e a demo não inclui candidaturas, finanças eleitorais, votações ou contas prontas. Cargas completas podem ser grandes, lentas e depender de operação externa. Explicações de IA podem estar ausentes ou conter erros e não representam validação jurídica do projeto de lei.

O escopo não inclui nota de políticos, ranking partidário, orientação de voto ou uso da colaboração como canal de campanha eleitoral.
