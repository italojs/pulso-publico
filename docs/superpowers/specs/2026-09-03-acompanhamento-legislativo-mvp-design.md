# Especificação do MVP de acompanhamento legislativo

## 1. Visão do produto

O produto ajuda cidadãos com pouco conhecimento político a acompanhar projetos de lei e parlamentares federais de forma simples, visual e neutra. O MVP cobre apenas a Câmara dos Deputados e o Senado Federal.

O usuário pode descobrir projetos, seguir projetos e parlamentares, entender o estágio de uma proposta e consultar votações sem precisar interpretar linguagem jurídica ou conhecer o processo legislativo.

## 2. Princípios

- Linguagem acessível para pessoas leigas em política.
- Neutralidade: o produto informa, mas não avalia parlamentares nem recomenda posições políticas.
- Rastreabilidade: todo dado factual deve vir de uma fonte oficial identificada.
- Transparência sobre IA: apenas o título simplificado e a breve descrição de um projeto podem ser gerados por IA.
- Cadastro opcional: consultar e seguir localmente não exige uma conta.
- Alertas úteis: apenas mudanças relevantes devem gerar notificação.

## 3. Escopo do MVP

### 3.1 Feed

O feed apresenta projetos novos e atualizações dos projetos e parlamentares seguidos. Cada cartão de projeto contém:

- título simplificado gerado por IA, identificado como tal;
- breve descrição gerada por IA, identificada como tal;
- identificação oficial do projeto;
- tema;
- casa atual ou casa de origem;
- situação atual;
- data da última movimentação;
- ação para seguir ou deixar de seguir.

O feed oferece busca textual e filtros por tema, partido, parlamentar, casa legislativa e situação do projeto.

### 3.2 Página do projeto

A página reúne:

- título simplificado e breve descrição gerados por IA;
- nome oficial, número, tipo, ano e ementa oficial;
- autoria e coautoria, com partido e casa quando aplicáveis;
- temas oficiais;
- situação atual destacada;
- data da última movimentação;
- linha do tempo da tramitação;
- votações relacionadas;
- resultado de cada votação;
- votos individuais quando forem nominais e públicos;
- links para os registros oficiais;
- data e hora da última verificação dos dados;
- ação para seguir e, mediante cadastro, ativar alertas.

#### Linha do tempo

A linha do tempo exibe os eventos oficiais na ordem em que ocorreram. Etapas concluídas aparecem como concluídas, a etapa atual recebe destaque e passos futuros aparecem apenas quando puderem ser determinados com segurança.

Uma referência didática pode agrupar o processo em apresentação, comissões, votação em uma casa, revisão pela outra casa, sanção ou veto e vigência. A interface deve se adaptar ao caminho real: um projeto pode começar no Senado, passar por várias comissões, retornar à casa de origem ou ser arquivado. O produto não deve inventar datas nem garantir etapas futuras.

### 3.3 Página do parlamentar

O MVP cobre deputados federais e senadores em exercício. A página contém:

- foto, nome, cargo, partido e unidade federativa;
- link para o perfil oficial;
- ação para seguir ou deixar de seguir;
- atividade recente;
- projetos de autoria ou coautoria;
- votações recentes;
- comissões das quais participa.

Não haverá nota, ranking, classificação ideológica ou avaliação automática do parlamentar.

### 3.4 Cartão de voto

Cada registro de voto mostra:

- qual matéria ou questão foi votada;
- data e casa legislativa;
- voto do parlamentar: sim, não, abstenção, obstrução ou outra classificação oficial;
- resultado geral;
- relação daquela votação com a tramitação do projeto;
- link para o registro oficial.

Quando o voto for secreto, não nominal ou não estiver disponível, a interface informa a ausência do dado e não tenta inferi-lo.

## 4. Uso de inteligência artificial

A IA pode gerar exclusivamente:

1. um título simplificado para o projeto;
2. uma breve descrição em linguagem acessível.

Esses dois campos devem ser visualmente identificados como conteúdo gerado por IA. O título oficial e a ementa oficial permanecem visíveis na página do projeto.

Autoria, partidos, tramitação, datas, temas, situações, votações, votos e resultados nunca podem ser produzidos ou completados por IA. Caso a geração falhe, a interface utiliza apenas o nome e a ementa oficiais.

## 5. Cadastro e preferências

Sem cadastro, o usuário pode:

- navegar, buscar e filtrar;
- abrir projetos e perfis;
- seguir projetos e parlamentares no dispositivo atual.

O cadastro passa a ser exigido quando o usuário:

- ativa uma notificação ou alerta;
- deseja sincronizar os itens seguidos entre dispositivos.

Ao concluir o cadastro, os itens já seguidos localmente são associados à conta, evitando que o usuário precise selecioná-los novamente.

## 6. Alertas

No MVP, alertas são enviados apenas para projetos seguidos e somente quando ocorrer:

- mudança de etapa ou situação relevante;
- agendamento de votação;
- publicação do resultado de uma votação;
- sanção ou veto;
- arquivamento;
- entrada em vigor.

Movimentações administrativas menores continuam visíveis na linha do tempo, mas não geram notificações. Eventos repetidos devem ser deduplicados antes do envio.

Seguir um parlamentar personaliza o feed com sua atividade. Notificações específicas sobre toda atividade parlamentar ficam fora do MVP para evitar excesso de alertas.

## 7. Fontes e atualização

As fontes oficiais do MVP são:

- Dados Abertos da Câmara dos Deputados;
- Dados Abertos do Senado Federal.

O Portal da Transparência, dados eleitorais do TSE e informações estaduais ou municipais ficam fora do MVP.

O sistema executa:

- atualização incremental a cada 30 minutos;
- priorização dos projetos seguidos durante a atualização;
- reconciliação completa diária;
- armazenamento do identificador da fonte e do momento da última verificação.

No desenvolvimento local, a carga inicial cobre uma janela móvel de 36 meses. Tramitações e votações detalhadas são carregadas sob demanda quando o projeto é aberto ou seguido. Na produção inicial, a base cobre a legislatura atual e consulta projetos mais antigos sob demanda. Documentos integrais e anexos permanecem hospedados nas fontes oficiais.

Como as casas legislativas controlam o momento da publicação, o produto não promete tempo real. A mensagem ao usuário será: “Atualizações frequentes com base nos registros oficiais da Câmara e do Senado.”

Se uma fonte estiver indisponível, o sistema mantém os últimos dados confirmados, informa que a atualização está atrasada e não dispara alertas com base em dados incompletos.

## 8. Fluxos principais

### Descobrir e seguir um projeto

1. O usuário acessa o feed sem cadastro.
2. Busca ou filtra projetos.
3. Lê o título simplificado, a descrição breve e a situação atual.
4. Abre a página de um projeto.
5. Consulta dados oficiais, linha do tempo e votações.
6. Segue o projeto no dispositivo.

### Ativar alertas

1. O usuário seleciona “Ativar alertas” em um projeto seguido.
2. O produto explica que uma conta é necessária para entregar e sincronizar notificações.
3. O usuário cria ou acessa a conta.
4. Os itens seguidos localmente são preservados.
5. O alerta é ativado.

### Acompanhar um parlamentar

1. O usuário busca um deputado ou senador.
2. Abre o perfil oficial consolidado.
3. Consulta projetos, atividade recente e votos.
4. Segue o parlamentar.
5. As atividades passam a aparecer no feed personalizado.

## 9. Componentes funcionais

- Cliente: feed, busca, filtros, páginas de projeto e parlamentar, preferências e autenticação.
- Serviço de ingestão: consulta Câmara e Senado, normaliza identificadores e detecta mudanças.
- Base de dados: armazena registros oficiais, histórico, relações entre matérias e preferências.
- Serviço de IA: gera somente título simplificado e breve descrição, com versionamento da geração.
- Serviço de alertas: aplica regras, deduplica eventos e entrega notificações aos usuários cadastrados.

As escolhas de plataforma cliente, tecnologias e canal inicial de notificação serão definidas no plano de implementação.

## 10. Critérios de aceite

O MVP será considerado funcional quando:

- uma pessoa puder consultar projetos e parlamentares sem criar conta;
- busca e filtros retornarem dados da Câmara e do Senado;
- cada projeto apresentar informações oficiais e distinguir claramente os dois campos gerados por IA;
- a linha do tempo refletir o histórico oficial sem inventar etapas;
- votações públicas mostrarem resultado e votos individuais disponíveis;
- o usuário puder seguir projetos e parlamentares no dispositivo;
- a ativação de alertas solicitar cadastro e preservar as escolhas anteriores;
- mudanças relevantes em projetos seguidos gerarem no máximo um alerta por evento;
- indisponibilidade de uma fonte não gerar dados ou alertas incorretos;
- toda informação factual oferecer referência à fonte oficial.

## 11. Fora do escopo

- política estadual e municipal;
- gastos públicos e dados do Portal da Transparência;
- informações eleitorais históricas do TSE;
- rankings, notas ou avaliações de parlamentares;
- classificação ideológica automática;
- comentários, curtidas ou recursos de rede social;
- recomendação personalizada de posição política;
- resumos longos ou análises de impacto gerados por IA;
- alertas para toda atividade de um parlamentar;
- catálogo de projetos relacionados ou semelhantes.
