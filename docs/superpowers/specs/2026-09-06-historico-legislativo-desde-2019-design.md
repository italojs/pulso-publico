# Histórico legislativo desde 2019 — Design

## Objetivo

Disponibilizar no Pulso Público todas as proposições federais da Câmara dos Deputados e do Senado Federal apresentadas desde 1º de janeiro de 2019, sem carregar antecipadamente o histórico detalhado de cada uma. Ao abrir, seguir ou relacionar uma matéria, o aplicativo buscará e guardará seu histórico completo nas fontes oficiais.

O caso principal de aceitação é a PEC 221/2019: a rota do Senado deve descobrir a versão original da Câmara, carregar sua tramitação e suas votações e apresentar a jornada bicameral completa.

## Escopo público

- O feed, a busca e os filtros passam a considerar proposições de 2019 até o ano corrente.
- A janela não será móvel: um projeto de 2019 continuará no catálogo nos próximos anos.
- O catálogo inicial guarda identificação, ementa, situação, datas, Casa, autoria e temas oficiais necessários para busca e filtros.
- Tramitações, votações e votos individuais serão carregados sob demanda quando a matéria for aberta, seguida ou identificada como parceira bicameral.
- Depois da primeira hidratação, os detalhes ficam no banco e podem ser atualizados sem nova carga completa.
- Documentos integrais, anexos, vídeos e arquivos oficiais continuam hospedados nas fontes de origem.

## Configuração

`INITIAL_HISTORY_MONTHS` será substituída por `LEGISLATIVE_HISTORY_START_YEAR`, com valor padrão `2019`. A configuração aceitará anos entre 1946 e o ano corrente, mas desenvolvimento e produção usarão 2019.

A data inicial efetiva será `1º de janeiro` do ano configurado. Isso evita que a cobertura mude silenciosamente com o passar do tempo, como ocorre com uma janela em meses.

## Importação histórica do catálogo

Um comando dedicado e retomável fará o backfill, separado do sincronismo incremental:

```bash
npm run backfill:legislative -- --from=2019 --source=all
```

Para a Câmara, o importador usará os arquivos anuais oficiais de proposições, autorias e temas. Para o Senado, percorrerá as consultas oficiais em janelas mensais delimitadas. Ambos normalizarão os dados usando os adaptadores existentes e persistirão por `upsert`, preservando as chaves oficiais.

O backfill trabalhará em ordem crescente de ano e registrará um checkpoint por fonte, conjunto e ano. Um ano concluído não será baixado novamente, salvo quando o operador usar uma opção explícita de atualização. Se o processo parar no meio de um ano, esse ano será reprocessado com segurança; as restrições únicas já existentes impedirão duplicatas.

Esses checkpoints ficarão em `historical_import_checkpoints`, separados por fonte, conjunto e ano, com estado, contagens agregadas, última tentativa e conclusão. A tabela não substituirá `sync_checkpoints`.

O comando imprimirá somente progresso agregado: fonte, ano, registros lidos, registros persistidos, duração e falha sanitizada. Linhas oficiais brutas, segredos e dados pessoais não serão escritos nos logs.

## Estado de hidratação detalhada

Será adicionada uma tabela `bill_hydration_state`, com uma linha por registro oficial:

- `bill_id`;
- `status`: `pending`, `running`, `complete` ou `failed`;
- `details_checked_at`;
- `last_requested_at`, usado para priorizar matérias abertas recentemente;
- `next_retry_at`;
- `error_code` limitado;
- `created_at` e `updated_at`.

O estado distingue claramente um projeto que ainda não foi hidratado de outro cuja fonte confirmou não possuir movimentações ou votações. Assim, a interface não poderá dizer “não há votações” quando o significado real for “os detalhes ainda não foram carregados”.

## Hidratação sob demanda

Ao abrir uma página de projeto, o servidor executará o seguinte fluxo:

1. lê o resumo local e o estado de hidratação;
2. se os detalhes estiverem ausentes ou vencidos, adquire um advisory lock por `fonte + identificador`;
3. consulta autoria, temas, tramitações, votações e votos individuais disponíveis;
4. persiste o grafo completo em uma transação;
5. marca a hidratação como concluída e renderiza os dados;
6. se a fonte falhar, mantém o conteúdo já armazenado, registra falha limitada e informa que a atualização está pendente.

Requisições concorrentes para o mesmo projeto compartilharão o resultado persistido; apenas uma fará consultas externas. Uma hidratação concluída recentemente será servida do banco. Projetos seguidos continuarão sendo atualizados pelo sincronizador periódico, independentemente de novas visitas.

Um estado `running` que ultrapasse o tempo máximo configurado será tratado como interrompido e poderá ser retomado pelo próximo acesso; ele não bloqueará a matéria indefinidamente.

O mesmo serviço será reutilizado por abertura, acompanhamento e reconciliação bicameral. Não haverá uma implementação diferente para cada entrada.

## Descoberta bicameral fora da janela

Quando uma matéria declarar origem ou destino na outra Casa, o reconciliador usará tipo, número e ano oficiais para procurar um parceiro exato na fonte correspondente. A data de apresentação não limitará essa busca.

O vínculo automático exige:

1. fonte diferente;
2. tipo, número e ano oficiais compatíveis;
3. sinal oficial de origem, revisão, remessa ou recebimento pela outra Casa;
4. exatamente um resultado na busca oficial.

Se o parceiro não estiver no banco, ele será importado e hidratado antes da composição da página. Se houver zero ou múltiplos resultados, o sistema manterá os registros separados e exibirá somente o que foi confirmado. Títulos, ementas e IA não serão usados para adivinhar vínculos.

A PEC 8/2025 continuará sendo uma proposição relacionada/apensada e não terá seus eventos misturados aos da PEC 221/2019.

## Sincronização contínua

O sincronismo periódico terá responsabilidades distintas:

- descobrir proposições novas apresentadas depois do checkpoint;
- atualizar projetos seguidos;
- atualizar matérias abertas recentemente cujo estado ainda esteja ativo;
- reconciliar parceiros bicamerais recém-publicados;
- atualizar o arquivo anual do ano corrente sem reprocessar todo o histórico.

O endpoint da Câmara com `dataInicio` e `dataFim` filtra por apresentação, não por última movimentação. O código não o tratará mais como uma fonte completa de “projetos alterados”. Projetos antigos ativos serão mantidos atuais pela fila de matérias seguidas, acessadas recentemente ou bicamerais, e pela reconciliação periódica.

Checkpoints do backfill histórico e do sincronismo incremental serão independentes. Executar o backfill não moverá para trás nem apagará os checkpoints atuais.

## Leitura pública e transparência

Enquanto a hidratação ainda estiver pendente, a página usará mensagens explícitas:

- “Carregando o histórico completo nas fontes oficiais”; ou
- “O histórico detalhado ainda não foi carregado”.

Somente após uma hidratação concluída a ausência poderá ser apresentada como fato:

- “A fonte oficial não publicou votações para esta matéria”.

Quando houver registros das duas Casas, Câmara e Senado continuarão separadas visualmente. Movimentações e votações serão ordenadas da mais recente para a mais antiga dentro de cada Casa, com links para a fonte que publicou cada evento.

## Desempenho e limites

- O backfill processará uma fonte e um conjunto anual por vez, com lotes limitados no banco.
- A hidratação individual terá concorrência e tentativas limitadas pelos controles HTTP existentes.
- Votos individuais serão persistidos somente quando a fonte os oferecer para uma votação nominal e pública.
- Nenhuma navegação disparará uma varredura global; o trabalho sob demanda ficará limitado à matéria aberta e ao parceiro bicameral confirmado.
- Índices e consultas do feed serão medidos após o backfill real; regressões relevantes de paginação ou filtros bloquearão a entrega.

## Migração e execução local

1. aplicar a migração aditiva do estado de hidratação e dos checkpoints históricos;
2. atualizar `.env.example`, a configuração local e a documentação para início em 2019;
3. executar o backfill de catálogo de 2019 até 2026;
4. hidratar e reconciliar a PEC 221/2019 como caso de validação;
5. manter o servidor disponível durante as etapas que não exigirem reinicialização;
6. registrar volume transferido, duração e crescimento real do banco na validação.

O processo não apagará proposições, históricos, usuários, acompanhamentos ou resumos já existentes.

## Tratamento de falhas

- Falha em um ano preserva os anos concluídos e permite retomada.
- Falha ao hidratar mantém o resumo e qualquer histórico anterior, sem publicar uma falsa ausência de dados.
- Respostas oficiais incompatíveis interrompem somente a unidade de trabalho afetada e recebem código diagnóstico limitado.
- Um vínculo ambíguo nunca é persistido automaticamente.
- Alertas só são publicados depois que o grafo oficial é persistido com sucesso e continuam deduplicados pelas chaves naturais.

## Estratégia de testes

### Unidade e integração

- configuração fixa em 2019 e rejeição de anos inválidos;
- backfill anual e mensal dentro dos limites solicitados;
- checkpoints independentes, retomada e idempotência;
- importação de autorias e temas usados pelos filtros;
- distinção entre `pending`, `complete` sem eventos e `failed`;
- advisory lock por projeto durante hidratação concorrente;
- atualização de projeto seguido ou acessado recentemente;
- busca exata e hidratação de parceiro anterior à janela local;
- ausência de vínculo por resultado ambíguo;
- preservação de dados existentes diante de falha oficial;
- nenhuma mistura de proposições somente apensadas.

### Validação manual

1. confirmar que busca e filtros encontram projetos de 2019;
2. abrir um projeto ainda não hidratado e confirmar o carregamento sob demanda;
3. recarregar a página e confirmar uso do conteúdo persistido;
4. abrir `/projetos/senado/9056435`;
5. confirmar Câmara e Senado na mesma jornada da PEC 221/2019;
6. confirmar, entre as votações da Câmara, a comissão especial por 34 a 4 e os dois turnos do Plenário por 472 a 22 e 461 a 19;
7. confirmar votos individuais e links oficiais quando disponíveis;
8. interromper e retomar um backfill sem duplicar registros;
9. validar feed, filtros e página de detalhes em desktop e celular.

## Critérios de aceite

- O catálogo contém todas as proposições oficiais elegíveis desde 2019 nas duas fontes.
- O feed e os filtros continuam paginados e responsivos depois do backfill.
- Abrir ou seguir uma matéria carrega seu histórico completo disponível e o preserva localmente.
- Uma matéria bicameral importa seu parceiro antigo mesmo quando apresentado antes da janela configurada.
- A PEC 221/2019 mostra as fases e votações da Câmara e a tramitação atual no Senado.
- A interface nunca confunde “não carregado” com “não publicado”.
- O processo pode ser interrompido e retomado sem perda nem duplicação.
- Toda informação factual mantém a fonte oficial; IA não participa de importação, vínculo ou preenchimento de fatos.

## Fora do escopo

- Proposições apresentadas antes de 2019, exceto parceiros oficialmente relacionados a matérias do catálogo.
- Pré-carregar o histórico detalhado de todas as proposições.
- Baixar documentos integrais, anexos, vídeos ou áudios.
- Inferir relações legislativas por similaridade textual ou IA.
- Incorporar política estadual ou municipal.
