# Histórico Bicameral Unificado — Design

## Objetivo

Representar uma matéria legislativa como uma única jornada pública, mesmo quando Câmara dos Deputados e Senado Federal mantêm registros oficiais distintos. Ao abrir qualquer uma das URLs conhecidas da matéria, o usuário deve ver o histórico completo desde a apresentação, com fases, tramitações e votações claramente atribuídas à respectiva Casa.

O caso de aceitação principal é a PEC 221/2019: a página do registro do Senado deve incluir a fase concluída da Câmara, suas votações e a fase atual do Senado.

## Decisões de produto

- O feed mostra uma única entrada para uma matéria bicameral confirmada.
- A página possui um único cabeçalho e um percurso por fases, inspirado na página de Matérias Bicamerais do Congresso Nacional.
- Câmara e Senado permanecem visualmente distintas em cada fase, movimentação e votação.
- Registros oficiais das duas Casas compõem o histórico da mesma matéria; suas fontes e identificadores não são descartados.
- Propostas apensadas, substitutivos e outras matérias relacionadas continuam sendo entidades independentes. Nesta entrega, elas podem ser relacionadas, mas seus eventos não são incorporados à linha do tempo da matéria principal.
- Um vínculo só pode ser criado com evidência oficial. Similaridade textual ou inferência de IA não são permitidas para correlacionar matérias.
- Seguir uma matéria significa acompanhar toda a sua jornada, inclusive mudanças futuras de Casa.

## Modelo de dados

Será criada a entidade `legislative_matters`, que representa a jornada canônica percebida pelo usuário. Cada linha existente em `bills` continuará representando um registro oficial de uma fonte e passará a pertencer a uma matéria por meio de `matter_id`.

`legislative_matters` terá:

- `id`: UUID usado internamente;
- `canonical_key`: chave única; começa como `source:external_id` para uma matéria isolada e passa a usar o identificador bicameral normalizado quando o vínculo é confirmado;
- `created_at` e `updated_at`.

`bills` conservará `source`, `external_id`, `official_code`, `congressional_key`, textos, status, URL e datas oficiais. O novo `matter_id` será obrigatório após a migração e indexado. A combinação `source + external_id` continuará única.

Será criada `bill_relations` para relações direcionais entre matérias oficialmente distintas. A tabela terá `from_matter_id`, `to_matter_id`, tipo da relação (`apensada_a`, `principal_de`, `substitutiva_de` ou `outra`), fonte oficial da evidência, URL oficial e data de conferência. Relações não alteram a composição do histórico bicameral.

Os registros existentes serão migrados inicialmente para matérias individuais. Somente pares confirmados pelo reconciliador bicameral serão unidos sob a mesma `legislative_matter`.

## Confirmação do vínculo bicameral

O vínculo automático exige todos os seguintes sinais:

1. tipo, número e ano oficiais compatíveis após normalização;
2. fontes diferentes;
3. evidência de trânsito entre as Casas nos metadados oficiais, como Casa iniciadora divergente da fonte atual, objetivo de revisão, remessa ou recebimento explícito;
4. resultado único na busca exata da outra fonte.

Quando o registro atual declarar origem na outra Casa e o parceiro ainda não estiver no banco por causa da janela local de 36 meses, o reconciliador buscará o parceiro por tipo, número e ano e fará hidratação completa sob demanda, independentemente da data original de apresentação.

Se houver zero resultados, múltiplos candidatos ou metadados contraditórios, o sistema não cria o vínculo. Ele registra uma falha diagnóstica limitada e mantém as matérias separadas. Não haverá correspondência por título, ementa ou modelo de linguagem.

Casos históricos em que a identificação mudou entre as Casas poderão ser adicionados por um vínculo explícito com URL oficial de evidência; essa exceção usa o mesmo modelo, sem regras aproximadas.

## Sincronização e reconciliação

Após persistir o grafo oficial de uma matéria, a sincronização executará a reconciliação bicameral:

1. identifica se o registro apresenta sinal de origem ou destino na outra Casa;
2. procura um parceiro local confirmado;
3. caso não exista, consulta a outra fonte com os identificadores oficiais exatos;
4. hidrata o grafo completo do parceiro, incluindo parlamentares necessários, movimentações, votações e votos individuais disponíveis;
5. associa ambos à mesma `legislative_matter` em transação;
6. preserva as URLs e os identificadores das duas fontes.

O reconciliador deve ser idempotente. Reexecuções não duplicam matérias, movimentações, votações, relações, acompanhamentos ou alertas.

Ao unir duas matérias antes isoladas, o reconciliador escolhe como sobrevivente a identidade da Casa de origem, move registros, acompanhamentos e alertas para ela, elimina duplicatas pelas chaves naturais existentes e só então remove a identidade vazia. A transação inteira é revertida se qualquer etapa falhar.

A reconciliação diária também revisita matérias bicamerais ativas. Isso permite descobrir a passagem para outra Casa mesmo quando a matéria original foi apresentada fora da janela móvel inicial.

## Leitura pública e feed

Qualquer rota existente `/projetos/:source/:externalId` resolve primeiro o registro oficial e depois sua `legislative_matter`. URLs antigas continuam válidas.

O feed seleciona um representante por matéria para evitar cartões duplicados. O representante é o registro com atividade oficial mais recente; em empate, prevalece o registro da Casa atual. Busca e filtros consideram os registros membros da matéria, mas retornam uma única entrada.

Na página de detalhes:

- cabeçalho, resumo por IA e situação atual vêm do representante atual;
- identificação de origem, autoria inicial e data de nascimento vêm do registro de origem;
- temas são a união sem duplicatas dos temas oficiais dos registros membros;
- “Última conferência” usa a conferência mais recente dos membros;
- cada fonte oficial disponível aparece com seu próprio link.

## Visualização das fases

No topo da página haverá um percurso de fases:

1. nascimento da matéria;
2. Câmara dos Deputados;
3. transferência entre as Casas, quando registrada;
4. Senado Federal;
5. sanção, veto ou promulgação, quando aplicável.

Cada fase tem um dos estados `concluída`, `atual` ou `futura`. A fase atual recebe maior contraste; fases concluídas exibem confirmação e data; fases futuras ficam visualmente discretas.

Câmara será identificada por nome, ícone e cor azul. Senado será identificado por nome, ícone e cor verde. Cor nunca será o único sinal: todos os elementos também terão texto e marcação acessível.

Abaixo do percurso, tramitações e votações serão agrupadas em seções por Casa, na ordem da jornada. Dentro de cada seção, eventos mantêm ordenação cronológica explícita e links para a fonte oficial daquela Casa.

Votações terão área própria, separada da tramitação. Eventos nominais exibem totais e votos individuais quando fornecidos pela fonte. Votações simbólicas explicam que não existe lista nominal completa e mostram apenas os votos contrários ou registros individualizados oficialmente disponíveis.

Quando uma decisão simbólica estiver publicada apenas como andamento ou resultado de reunião, o adaptador poderá criar um evento de votação estruturado a partir desse registro oficial. Essa transformação será determinística, conservará o texto integral e a URL de origem e nunca completará nomes ou resultados por inferência.

## Acompanhamentos e alertas

O acompanhamento passará de `bill_id` para `matter_id`. A migração preservará todos os itens seguidos e eliminará duplicatas caso um usuário já siga os dois registros oficiais da mesma matéria.

Alertas também serão associados à matéria. Um usuário que começou a acompanhar na Câmara continuará recebendo eventos do Senado sem precisar seguir novamente. O alerta conserva a Casa, a descrição e a URL da fonte que produziu o evento.

## Falhas e transparência

- Se uma fonte estiver temporariamente indisponível, a página exibe o histórico já confirmado e informa qual Casa ainda não pôde ser atualizada.
- Se existir indicação de trânsito bicameral sem parceiro confirmado, a página não inventa a fase ausente e mantém o link oficial disponível.
- Se uma votação for simbólica, secreta ou não tiver votos individuais publicados, a interface explica essa condição.
- Divergências entre fontes são apresentadas com seus respectivos rótulos e links; dados oficiais não são reescritos por IA.

## Estratégia de testes

### Unidade e integração

- migração e persistência de matéria canônica;
- confirmação e rejeição de candidatos bicamerais;
- hidratação sob demanda de um parceiro fora da janela de 36 meses;
- idempotência da reconciliação;
- composição de autores, temas, movimentações, votações e votos de duas Casas;
- deduplicação do feed;
- preservação e deduplicação de acompanhamentos e alertas;
- ausência de mistura com matérias apenas apensadas;
- estados e acessibilidade do percurso de fases.

### Validação manual

1. abrir `/projetos/senado/9056435`;
2. confirmar uma única página para a PEC 221/2019;
3. confirmar fase concluída da Câmara e fase atual do Senado;
4. confirmar as votações da Câmara de 34 a 4, 472 a 22 e 461 a 19 quando disponíveis na fonte estruturada;
5. confirmar a votação simbólica da CCJ do Senado com a explicação sobre ausência de lista nominal completa;
6. confirmar links oficiais distintos para Câmara e Senado;
7. confirmar que PEC 8/2025 aparece somente como relacionada, sem seus eventos misturados;
8. confirmar que seguir por qualquer URL acompanha a matéria inteira;
9. validar o comportamento em tela larga e móvel, navegação por teclado e leitores de tela.

## Fora do escopo desta entrega

- Misturar linhas do tempo de matérias apensadas ou substitutivos.
- Usar IA para identificar relacionamentos legislativos.
- Baixar documentos integrais e anexos oficiais.
- Corrigir ou reinterpretar divergências existentes entre as fontes oficiais.
