# Experiência pública, IA, contas e alertas

## Decisão e contexto

Esta especificação completa o núcleo de dados já implementado. Ela consolida as decisões tomadas com o usuário e a autorização para concluir o MVP: experiência pública, títulos e descrições curtas por IA, cadastro opcional, itens seguidos e alertas.

O aplicativo deve responder, sem exigir conhecimento político: **o que é**, **em que ponto está**, **o que aconteceu** e **onde confirmar na fonte oficial**.

## Arquitetura funcional

- Next.js App Router renderiza páginas públicas no servidor e componentes interativos pequenos no cliente.
- PostgreSQL continua sendo a fonte interna dos registros oficiais normalizados.
- Uma camada de consultas produz modelos de leitura próprios para feed, projeto e parlamentar; páginas não consultam tabelas diretamente.
- Estado de “seguir” funciona em `localStorage` para visitantes. Após autenticação, os itens locais são enviados ao servidor e mesclados com os itens da conta.
- Alertas dentro do aplicativo funcionam sem serviço externo. Web Push é uma melhoria progressiva e só é habilitado quando as chaves VAPID estiverem configuradas.
- A geração por IA é assíncrona, versionada e nunca bloqueia a página. Sem credenciais ou em caso de erro, a interface usa o título e a ementa oficiais.

## Rotas e navegação

- `/`: feed paginado, busca e filtros.
- `/projetos/[source]/[externalId]`: ficha completa, linha do tempo e votações.
- `/parlamentares/[source]/[externalId]`: perfil, proposições e votos recentes.
- `/seguindo`: itens seguidos no dispositivo ou na conta.
- `/alertas`: caixa de alertas da conta.
- `/entrar` e `/cadastro`: autenticação apenas quando necessária.

Os identificadores da fonte permanecem na URL para eliminar colisões entre Câmara e Senado. Busca e filtros usam parâmetros de URL, o que permite compartilhar uma visão e preserva navegação do navegador.

## Linguagem visual

### Conceito

“Mapa de tramitação”: a interface lembra uma sinalização cívica contemporânea, não um portal burocrático. O elemento de assinatura é um trilho vertical com estações que aparece tanto nos cartões quanto na linha do tempo completa.

### Paleta

- tinta: `#17241F`;
- névoa: `#F3F6F5`;
- superfície: `#FFFFFF`;
- verde cívico: `#087A59`;
- amarelo de atenção: `#F1C84B`;
- azul institucional: `#275D8C`.

As cores nunca são a única forma de comunicar estado. Texto, ícone e posição acompanham cada uso semântico.

### Tipografia e hierarquia

- Títulos e estados: família condensada de sinalização, em caixa controlada.
- Texto corrido: família altamente legível, com altura-x ampla.
- Identificadores e datas: papel utilitário monoespaçado.

O estado atual é deliberadamente grande nas páginas de projeto. O nome oficial, fontes e metadados aparecem logo abaixo, com contraste e hierarquia suficientes para não serem confundidos com texto gerado por IA.

### Layout

No desktop, cabeçalho compacto, conteúdo central com até 1180 px e filtros em uma faixa lateral/colapsável. No celular, filtros viram painel, ações principais permanecem ao alcance e a navegação essencial fica compacta. O feed evita painéis genéricos de métricas e começa diretamente pelo que mudou.

## Feed e consultas

O feed ordena projetos pela movimentação mais recente conhecida e aceita:

- texto em código, título e ementa oficiais;
- Câmara ou Senado;
- situação;
- tema;
- partido do autor;
- autor;
- ordenação por atualização ou apresentação;
- paginação por página, com 20 itens por padrão.

Cada cartão mostra título amigável e descrição apenas quando há resumo de IA válido, ambos com a marca “Gerado por IA”. O código, situação, casa, tema, data e fonte são oficiais. Na ausência de IA, o cartão apresenta o título e a ementa oficiais sem a marca.

## Projeto

A página apresenta:

1. estado atual em destaque;
2. título amigável e descrição, se disponíveis, identificados como IA;
3. código, título, ementa, temas, autores e link oficial;
4. trilho cronológico real, sem prever caminhos não confirmados;
5. votações com resultado, tipo e votos nominais públicos;
6. horário da última conferência e estado de saúde da fonte;
7. ações para seguir e ativar alertas.

Abrir ou seguir uma matéria pode solicitar hidratação assíncrona, mas a resposta pública nunca depende da disponibilidade instantânea da casa legislativa.

## Parlamentar

O perfil mostra identidade oficial, partido, UF, cargo, projetos de autoria, atividade recente e votos nominais. Não existem nota, ranking, ideologia inferida ou comparação avaliativa. Votos indisponíveis são descritos exatamente assim, sem inferência.

## IA

Somente `friendlyTitle` e `shortDescription` são armazenados. Cada geração inclui modelo, versão do prompt, impressão digital dos campos oficiais usados e datas. A saída deve:

- estar em português do Brasil;
- ser neutra e compreensível para uma pessoa leiga;
- não acrescentar fatos, impacto, intenção ou previsão ausentes das fontes;
- respeitar limites de tamanho;
- ser descartada quando inválida.

Uma nova geração ocorre somente quando a impressão digital muda ou a versão do prompt aumenta.

## Conta e sessão

- E-mail normalizado e senha com derivação `scrypt` do Node.js.
- Token de sessão aleatório; apenas o hash é armazenado.
- Cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção, com expiração.
- Cadastro e login nunca são exigidos para leitura ou para seguir localmente.
- Ao entrar, o cliente envia seus identificadores locais e o servidor faz união idempotente.

## Alertas

Eventos relevantes são criados quando a sincronização confirma mudança de situação, agendamento/resultado de votação, sanção/veto, arquivamento ou vigência. A chave `tipo + referência oficial` impede duplicação. O evento é distribuído somente a contas que seguem a matéria.

A caixa interna de alertas oferece lido/não lido e funciona sempre. Web Push usa a mesma caixa como registro e apenas tenta a entrega externa quando há inscrição e VAPID configurado; falha de push não perde o alerta.

## Acessibilidade e estados de falha

- HTML semântico, foco visível, rótulos associados e operação por teclado.
- Contraste AA, áreas de toque adequadas e respeito a `prefers-reduced-motion`.
- Carregamento, vazio e erro têm mensagens úteis em linguagem simples.
- Atraso da fonte é comunicado sem apagar o último dado confirmado.
- Não há gradientes nem animações decorativas contínuas.

## Critérios de aceite adicionais

- O feed real carrega e filtra dados das duas casas.
- URLs públicas podem ser recarregadas e compartilhadas.
- Projeto e parlamentar têm navegação cruzada consistente.
- A marcação de IA é inequívoca e não aparece sobre conteúdo oficial.
- Seguir funciona anonimamente e persiste após cadastro.
- Cadastro, entrada, saída, sessão e alertas são cobertos por testes.
- Sem chaves, build e uso principal continuam funcionais.
- Desktop e celular são validados manualmente no navegador, incluindo um fluxo por teclado.

