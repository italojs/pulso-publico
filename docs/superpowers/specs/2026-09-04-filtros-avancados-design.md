# Filtros avançados do feed legislativo

**Data:** 2026-09-04  
**Status:** aguardando revisão do usuário

## 1. Contexto e objetivo

O feed já permite buscar por texto e filtrar por fonte, situação, tema, partido e autoria. A evolução aprovada deve oferecer uma aba de filtros avançados com todas as dimensões úteis presentes nos dados oficiais da Câmara e do Senado, sem expor códigos técnicos ao cidadão.

O objetivo é permitir que uma pessoa leiga encontre projetos por identificação, tramitação, datas, votação, assunto, autoria e relação de acompanhamento. O resultado precisa continuar paginado, reproduzível por URL e compreensível mesmo quando a fonte oficial não oferece determinado dado.

## 2. Princípios do produto

- Os filtros usam somente dados oficiais armazenados; não dependem de IA.
- “Todas as possibilidades” significa todas as dimensões públicas e confiáveis do modelo canônico, não campos internos de integração.
- A interface usa nomes cotidianos e ajuda contextual curta para conceitos como casa de origem e votação nominal.
- Opções sem registros não aparecem nos seletores.
- A ausência de dados nunca é interpretada como “não”; ela aparece como “informação não disponível”.
- Filtros de votação descrevem votações relacionadas ao projeto, não afirmam que o projeto inteiro foi aprovado ou rejeitado.

## 3. Experiência da interface

### 3.1 Filtros rápidos

A busca textual permanece sempre visível. Ao lado dela ficam os filtros rápidos de maior uso: casa legislativa, situação e tema. Um botão “Filtros avançados” abre o painel completo e mostra a quantidade de filtros ativos.

### 3.2 Painel avançado

No desktop, o painel abre lateralmente sem tirar o contexto do feed. Em telas pequenas, ocupa a tela inteira. O painel é dividido em seções recolhíveis:

1. Identificação;
2. Tramitação;
3. Datas e atividade;
4. Votações;
5. Assuntos e autoria;
6. Acompanhamento;
7. Ordenação.

As ações “Limpar tudo” e “Mostrar N projetos” permanecem fixas no rodapé. Sempre que possível, o botão mostra uma contagem atualizada após um pequeno atraso, sem disparar uma consulta a cada tecla.

Depois da aplicação, cada valor ativo aparece como uma etiqueta removível acima dos resultados. Remover uma etiqueta preserva os demais filtros. O navegador mantém a posição e o botão Voltar restaura a busca anterior.

## 4. Catálogo de filtros

### 4.1 Identificação

| Filtro | Controle | Comportamento |
|---|---|---|
| Palavra-chave | campo de busca | Busca em código, título e ementa oficiais. |
| Tipo da proposta | seleção múltipla | PEC, PL, PLP, MPV e demais tipos existentes na base. |
| Número | campo numérico | Correspondência exata dentro dos tipos e anos selecionados. |
| Ano | intervalo numérico | Usa o ano oficial da proposta; permite informar somente o início, somente o fim ou ambos. |

### 4.2 Tramitação

| Filtro | Controle | Comportamento |
|---|---|---|
| Fonte | seleção múltipla | Câmara e Senado. |
| Casa de origem | seleção múltipla | Câmara, Senado ou Congresso. |
| Casa atual | seleção múltipla | Casa em que a matéria se encontra; inclui “não informada”. |
| Situação atual | seleção múltipla pesquisável | Valores oficiais disponíveis na base. |
| Fase simplificada | seleção múltipla | Apresentada, em comissões, pronta para votação, votada, sanção/veto, encerrada e não classificada. A categoria é determinística, baseada no status oficial, e não usa IA. |

### 4.3 Datas e atividade

| Filtro | Controle | Comportamento |
|---|---|---|
| Data de apresentação | intervalo de datas | Limites inclusivos. |
| Última movimentação | intervalo de datas | Considera movimentações, votações e apresentação. |
| Atualização recente | atalhos | Últimas 24 horas, 7 dias, 30 dias ou período personalizado. |

### 4.4 Votações

| Filtro | Controle | Comportamento |
|---|---|---|
| Histórico de votação | escolha única | Todos, com votação ou sem votação. |
| Tipo da votação | seleção múltipla | Nominal, não nominal ou secreta. |
| Votos individuais | escolha única | Disponíveis, indisponíveis ou qualquer situação. |
| Resultado relacionado | seleção múltipla | Aprovada, rejeitada, outros ou não informado. A correspondência considera qualquer evento de votação relacionado e mantém o texto oficial no detalhe. |
| Casa da votação | seleção múltipla | Câmara, Senado ou Congresso. |

### 4.5 Assuntos e autoria

| Filtro | Controle | Comportamento |
|---|---|---|
| Tema oficial | seleção múltipla pesquisável | Temas retornados pelas fontes oficiais. |
| Autor | campo com sugestões | Um ou mais autores. |
| Partido do autor | seleção múltipla | Partidos presentes na autoria. |
| Estado do parlamentar | seleção múltipla | UF do parlamentar vinculado; registros sem vínculo ficam como “não informado”. |

### 4.6 Acompanhamento

| Filtro | Controle | Comportamento |
|---|---|---|
| Somente acompanhados | alternância | Restringe o resultado aos projetos acompanhados pelo usuário. |

Para usuários autenticados, a restrição é resolvida no servidor pela tabela de acompanhamentos. Para usuários sem cadastro, o painel lê as chaves já guardadas localmente e as envia somente no corpo da consulta de busca; elas não são gravadas na URL. A paginação continua sendo calculada pelo servidor sobre a lista completa de chaves recebidas. Se nada estiver acompanhado, a interface explica como começar e não mostra um erro técnico.

### 4.7 Ordenação

- atividade mais recente;
- apresentação mais recente;
- apresentação mais antiga;
- maior número de movimentações;
- maior número de votações.

Ordenações por “popularidade” ou “importância” ficam fora desta entrega porque exigiriam um critério editorial ou dados de comportamento ainda não definidos.

## 5. Regras de combinação e URL

- Grupos diferentes são combinados com **E**: por exemplo, tema Trabalho **e** origem Câmara.
- Valores do mesmo filtro são combinados com **OU**: por exemplo, PEC **ou** PL.
- Intervalos de datas aceitam início, fim ou ambos; um início posterior ao fim produz uma mensagem de validação.
- Parâmetros repetidos representam seleções múltiplas, como `tipo=PEC&tipo=PL`.
- Textos são aparados, listas são deduplicadas e limites máximos impedem URLs ou consultas abusivas.
- Alterar qualquer filtro reinicia a paginação na página 1.
- A URL contém todos os filtros compartilháveis. As chaves locais de projetos acompanhados são a única exceção por privacidade e tamanho.

## 6. Modelo de dados e normalização

A tabela `bills` passa a armazenar `proposal_type`, `proposal_number`, `proposal_year` e `simplified_stage`. Os valores vêm dos campos estruturados das fontes quando disponíveis, com parser determinístico do código oficial como fallback. Uma migração faz o backfill dos registros existentes; casos não reconhecidos permanecem nulos e continuam pesquisáveis por texto.

Os eventos de votação passam a armazenar uma categoria normalizada de resultado (`approved`, `rejected`, `other`, `unavailable`) além do texto oficial já preservado. Essa normalização usa regras explícitas testadas por fonte. Ambiguidades são classificadas como `other`, nunca inferidas.

Índices são adicionados somente às colunas e combinações confirmadas pelas consultas: tipo/ano, fase, casas, datas e categoria de resultado. Consultas relacionais usam `exists` para temas, autores, parlamentares, votações e acompanhamentos, evitando duplicar projetos no resultado.

## 7. Componentes e fluxo de dados

- `search-params` valida e serializa filtros compartilháveis.
- O modelo público ganha tipos explícitos para cada filtro e opções facetadas.
- O serviço de consulta constrói condições SQL parametrizadas e calcula total/paginação.
- Uma rota de prévia retorna apenas a contagem para atualizar “Mostrar N projetos”.
- A busca comum continua renderizada no servidor pela URL.
- Quando “Somente acompanhados” estiver ativo sem login, o componente cliente envia os identificadores locais por `POST` para uma rota de busca e renderiza a mesma estrutura de resultados.
- O painel e as etiquetas são componentes separados do formulário de busca rápida, mas compartilham o mesmo contrato de filtros.

## 8. Estados de erro e acessibilidade

- Falha ao carregar opções mantém a busca textual e oferece nova tentativa.
- Valores antigos que deixaram de existir são preservados na URL e marcados como indisponíveis até serem removidos.
- O painel mantém foco preso enquanto aberto, fecha com `Escape` e devolve o foco ao botão de origem.
- Seções, rótulos, ajuda e mensagens de validação têm associação semântica para leitores de tela.
- A contagem em atualização usa região de status sem interromper a navegação.
- Nenhum seletor depende exclusivamente de cor.

## 9. Desempenho e proteção

- A prévia da contagem usa debounce e cancela requisições substituídas.
- O servidor limita quantidade de valores por filtro, tamanho dos textos, intervalo permitido e tamanho da página.
- Todas as condições usam o construtor parametrizado do Drizzle.
- O catálogo de opções pode ser armazenado em cache curto e é invalidado após sincronização relevante.
- As consultas finais serão verificadas com `EXPLAIN ANALYZE` sobre a base local de três anos antes de considerar a entrega concluída.

## 10. Testes e validação

- Testes unitários do parser, serializador, normalização de tipo/fase/resultado e regras de combinação.
- Testes de consulta cobrindo cada filtro isolado, combinações E/OU, intervalos, nulos, paginação e ordenação.
- Testes do modo “Somente acompanhados” autenticado e anônimo.
- Testes de componentes para abertura, fechamento, etiquetas, limpeza e acessibilidade por teclado.
- Validação de tipagem, suíte completa e build de produção.
- Validação manual no desktop e em viewport móvel com URL compartilhável, navegação Voltar e estados sem resultado.

## 11. Fora do escopo

- Classificar importância política, tendência ou popularidade.
- Prever se um projeto será aprovado.
- Inferir posicionamentos ou temas com IA.
- Filtrar por gastos, patrimônio ou dados eleitorais externos à Câmara e ao Senado.
- Substituir as descrições oficiais por conteúdo gerado.
