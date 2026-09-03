# Roteiro de implementação do MVP

O MVP será entregue em quatro planos independentes e sequenciais. Cada plano termina com software testável e reduz o risco do seguinte.

1. **Núcleo de dados legislativos:** projeto executável, modelo de dados normalizado, conectores da Câmara e do Senado, sincronização incremental, reconciliação e observabilidade.
2. **Experiência pública:** PWA mobile-first com feed, busca, filtros, página de projeto, linha do tempo, página de parlamentar e cartões de voto.
3. **Títulos e descrições por IA:** geração limitada aos dois campos aprovados, identificação visual, versionamento, validação e fallback para os dados oficiais.
4. **Contas, itens seguidos e alertas:** preferências locais, cadastro sob demanda, migração das preferências, detecção de eventos, deduplicação e notificações web.

O primeiro plano está detalhado em `docs/superpowers/plans/2026-09-03-legislative-data-core.md`.

## Runtime

O projeto usa Node.js 26.8.1 no desenvolvimento, com atualização para o patch 26.x mais recente antes de cada lançamento. O código aproveita `Temporal`, execução nativa de scripts TypeScript e o `fetch` baseado em Undici 8. Como a linha 26 permanece Current até outubro de 2026, a publicação em produção deve confirmar sua entrada em LTS. APIs experimentais não entram no MVP.

## Política de volume de dados

- Desenvolvimento local: janela móvel dos últimos 36 meses. Em 3 de setembro de 2026, o corte inicial é 3 de setembro de 2023.
- Testes automatizados: fixtures pequenas e determinísticas, sem baixar bases completas.
- Produção inicial: dados básicos da legislatura atual; matérias anteriores são buscadas sob demanda.
- Tramitações e votos detalhados: hidratação sob demanda quando uma matéria é aberta ou seguida, seguida de armazenamento em cache.
- Documentos integrais e anexos: permanecem na fonte oficial e são acessados por link.
