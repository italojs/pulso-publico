# Validação do MVP — 3 de setembro de 2026

## Resultado

O MVP foi validado em Node.js 26.8.1, Next.js 16.3.4 e PostgreSQL 18.4. A carga móvel de 36 meses terminou com saúde `ok` nas duas fontes.

Base local ao final da validação:

| Fonte | Projetos |
| --- | ---: |
| Câmara dos Deputados | 241.764 |
| Senado Federal | 15.602 |
| Total | 257.366 |

Checkpoints gravados em 3 de setembro de 2026 às 23:40 (Câmara) e 23:35 (Senado), horário de Brasília.

## Verificação automatizada

Executar, a partir da raiz:

```bash
TEST_DATABASE_URL=postgres://italojose@127.0.0.1:5435/legislativo_codex_test npm test
npm run typecheck
DATABASE_URL=postgres://italojose@127.0.0.1:5435/legislativo_codex_dev npm run build
```

Resultado final: 28 arquivos e 108 testes aprovados, TypeScript sem erros e build de produção concluída com as 13 rotas geradas.

## Percurso manual executado

- Feed desktop com dados das duas casas, busca, paginação e filtros combinados por Senado e Saúde.
- Projeto do Senado com situação oficial, ementa, autores, 14 movimentações e links oficiais.
- Perfil parlamentar com identidade, partido, UF, projetos associados e ausência de avaliações ou ranking.
- Seguir projeto anonimamente, persistir no dispositivo, entrar com conta local de validação e unir o item à conta.
- Ativar alertas, publicar um evento deduplicado para o projeto seguido, exibi-lo somente ao usuário correto e marcar como lido.
- Feed, projeto, seguindo, alertas, parlamentar e login em viewport de 390 × 844 px.
- Largura do documento igual à viewport em todas as páginas; um URL longo dentro de uma movimentação foi usado para confirmar a quebra de linha.
- Console do navegador sem erros ou avisos.
- Endpoint `/api/health` com `status: ok` e as duas fontes disponíveis após sincronização real.
- Feed com os 257.366 registros abrindo em aproximadamente 0,7 s no ambiente local de validação.
- Segundo ciclo incremental concluído em 9,3 s: 0 novas matérias da Câmara e atualização detalhada apenas do projeto do Senado acompanhado.

## Problemas encontrados e corrigidos durante a validação

1. O build não resolvia imports de componentes `.tsx`; o mapa de imports passou a distinguir módulos de UI.
2. Formulários acessados em `127.0.0.1` eram comparados ao host interno `localhost`; a origem pública agora considera `Host` e os cabeçalhos do proxy, preservando proteção contra origem externa, redirects e cookie `Secure`.
3. Uma URL oficial longa causava overflow na linha do tempo móvel; a grade passou a permitir encolhimento e quebra segura.
4. O timeout do cliente HTTP continuava ativo após a chegada dos cabeçalhos e abortava corpos válidos; o temporizador agora é cancelado antes de devolver a resposta.
5. O processamento lento do banco mantinha o stream anual da Câmara aberto e sujeito a quedas; cada arquivo anual é baixado por completo, limitado a um ano por vez, com repetição do corpo interrompido antes da importação.
6. A granularidade diária da listagem da Câmara fazia o ciclo recorrente reprocessar centenas de matérias; o intervalo agora é refinado pelo instante oficial de apresentação e todo projeto acompanhado é reidratado explicitamente. O endpoint recente do Senado também é limitado ao intervalo exato.

## Recursos opcionais ainda sem credenciais

- Geração por IA: contrato, validação, persistência, versionamento e fallback foram testados; nenhuma geração externa foi enviada porque `OPENAI_API_KEY` e `OPENAI_MODEL` não estão configurados.
- Web Push: inscrição, armazenamento, expiração, despacho e modo desabilitado foram testados; nenhuma notificação externa foi enviada porque as chaves VAPID não estão configuradas.

A caixa interna de alertas e todo o produto principal funcionam sem essas credenciais.
