# Produção no Galaxy e coletor histórico saudável — desenho aprovado

## Objetivo

Publicar o Pulso Público no Galaxy com Node.js 22 e PostgreSQL 18, preservando a experiência já validada, e preencher continuamente o banco de produção com o catálogo legislativo federal disponível entre 1946 e o ano corrente. A coleta deve respeitar as fontes oficiais, sobreviver a interrupções e manter o aplicativo utilizável durante todo o processo.

O catálogo eleitoral permanece restrito à eleição de 2026. A ampliação para eleições anteriores não faz parte desta entrega.

## Estado inicial e restrições

- O banco gerenciado `pulse` já existe no Galaxy, na região `us-east-1`.
- A instância é PostgreSQL 18, standalone, plano Pro, com 4 GB de RAM, 4 gCPU e 30 GB de armazenamento.
- O Galaxy oferece Node.js 18, 20 e 22 para Web Apps. O projeto inteiro será padronizado em Node.js 22, tanto no desenvolvimento quanto em produção.
- O repositório ainda não possui remoto Git configurado. A primeira publicação usará o Galaxy CLI a partir do diretório local; integração automática com Git pode ser adicionada depois.
- O banco local atual, com catálogo legislativo desde 2019 e eleição de 2026, ocupa aproximadamente 1 GB. As fotos eleitorais publicadas ocupam aproximadamente 160 MB.
- O arquivo local do catálogo não será enviado como parte do deploy. A produção será criada por migrações e preenchida pelos coletores oficiais.
- A carga histórica não será executada no processo HTTP do aplicativo nem durante o build ou a inicialização do contêiner.

## Arquitetura de produção

### Aplicação

O aplicativo continuará como um servidor Next.js com App Router. O build usará `output: "standalone"`, exigido pelo Galaxy para aplicações Next.js, e o processo respeitará a porta fornecida em `PORT`.

A publicação inicial usará um único contêiner Web App no plano Production. O tamanho será o menor contêiner que passar pelo build, pelo health check e pela validação de memória; qualquer contratação ou mudança de plano será apresentada ao usuário para confirmação no momento imediatamente anterior à criação.

O health check do Galaxy usará `/api/health`. Durante a carga histórica, o endpoint poderá informar fontes degradadas sem derrubar o processo HTTP. Uma falha real de conexão com o banco continuará retornando erro.

### Banco de dados

O usuário administrador exibido pelo Galaxy será usado somente para a preparação inicial. Será criado um banco lógico da aplicação e um usuário PostgreSQL não superusuário, com propriedade do banco e permissão suficiente para executar as migrações do próprio esquema e as operações normais do aplicativo.

A conexão de produção ficará somente nas variáveis protegidas do Galaxy e em um arquivo local específico de produção ignorado pelo Git. Credenciais, chaves da OpenAI e chaves Web Push não serão adicionadas ao repositório nem impressas em logs.

As migrações serão idempotentes e aplicadas antes da nova versão receber tráfego. Uma falha de migração impedirá o deploy, preservando a versão anterior.

### Mídia eleitoral

Fotos das candidaturas de 2026 deixarão de depender de um diretório permanente no contêiner. O conteúdo JPEG será armazenado em uma tabela de blobs do PostgreSQL, identificado pela chave de armazenamento já usada pelo catálogo e protegido pelos mesmos metadados de proveniência.

Planos de governo, certidões e outros documentos grandes continuarão vinculados às URLs oficiais. O aplicativo não fará cópias integrais desses PDFs nesta entrega. A rota de mídia continuará validando tipo, chave e candidatura antes de devolver uma foto.

## Coletor histórico

### Execução

O coletor será um comando Node.js separado do servidor web e executado inicialmente no Mac de desenvolvimento, conectado ao banco do Galaxy. Suspensão, reinício ou perda de rede apenas interrompem o trabalho; uma nova execução retoma o último checkpoint confirmado.

O comando terá opções explícitas para ano inicial, ano final, fonte, limite de chamadas e modo de execução. A configuração padrão de produção cobrirá as duas casas, do ano corrente até 1946, em ordem decrescente.

Exemplo de interface pretendida:

```bash
npm run collect:history -- --from=1946 --through=2026 --source=all
npm run collect:status
```

O ano corrente não será fixado no código. Quando a execução atravessar uma virada de ano, a manutenção incremental poderá criar as tarefas do novo ano sem refazer anos concluídos.

### Estratégia por fonte

Para a Câmara, o catálogo anual usará preferencialmente os arquivos completos disponibilizados pelo portal de Dados Abertos. A API paginada será usada para recursos detalhados, tramitações e votações que não estejam completos nos arquivos. As respostas serão relacionadas exclusivamente por identificadores oficiais.

Para o Senado, o coletor usará os endpoints oficiais já implementados pelo adaptador, mantendo paginação e identificadores de processo. Nenhuma relação bicameral será inferida por semelhança textual; continuam válidas apenas as chaves oficiais aceitas pelo reconciliador existente.

Cada ano será dividido nas seguintes fases:

1. catálogo de proposições;
2. autores e temas;
3. tramitações;
4. eventos de votação;
5. votos individuais publicados;
6. reconciliação bicameral e validação do ano.

Uma fase concluída não será repetida, salvo quando o operador fornecer `--refresh`. A atualização corrente permanece prioritária: tarefas incrementais recentes podem avançar antes de lotes históricos antigos.

### Ritmo e concorrência

- Cada fonte terá concorrência padrão igual a um.
- O limite padrão será de 20 requisições por minuto por fonte, equivalente a pelo menos três segundos entre inícios de chamadas.
- O controle será feito por fonte, impedindo que uma resposta lenta provoque uma rajada posterior.
- `Retry-After` será respeitado integralmente quando publicado.
- Erros `429`, timeouts e respostas `5xx` usarão espera exponencial com jitter e limite máximo.
- Erros contratuais ou registros inválidos não entrarão em repetição infinita: serão registrados de forma sanitizada e a tarefa ficará disponível para inspeção e nova tentativa explícita.
- Escritas usarão lotes pequenos e transações curtas. Um lote só avança o checkpoint depois do commit.
- Advisory locks no PostgreSQL impedirão dois coletores de processar o mesmo escopo simultaneamente.

Os valores poderão ser reduzidos por parâmetro sem alterar o código. O operador não poderá ultrapassar um teto interno conservador sem uma mudança revisada no projeto.

### Persistência da fila

O banco receberá uma tabela de tarefas com, no mínimo:

- fonte;
- ano;
- fase;
- cursor ou página seguinte;
- estado (`pending`, `running`, `waiting`, `complete` ou `failed`);
- número de tentativas;
- instante da próxima tentativa;
- contadores processados;
- código de erro sanitizado;
- início, atualização e conclusão.

A unicidade de fonte, ano e fase garante idempotência. Tarefas abandonadas em `running` serão recuperadas depois de um prazo de lease. O cursor armazenado sempre representará dados já confirmados no banco.

Uma segunda tabela manterá o estado geral da execução e métricas agregadas. O comando de status mostrará somente informações operacionais: anos e fases concluídos, fila restante, registros persistidos, taxa recente e falhas. Nenhum segredo ou linha bruta sensível será exibido.

### Idempotência e atualização

Todas as entidades continuarão usando os índices únicos de fonte e identificador externo. Reexecutar uma página atualizará dados oficiais alterados e não criará duplicatas.

Anos históricos completos serão considerados estáveis, mas poderão receber reconciliação periódica de baixa frequência. O ano corrente será atualizado continuamente pelo sincronizador incremental existente. Ao alcançar 1946, o coletor histórico encerrará a fila histórica e passará a executar somente manutenção incremental quando chamado.

## Fluxo de dados

1. O coletor reserva uma tarefa elegível usando lease e advisory lock.
2. O adaptador consulta arquivo ou API oficial no ritmo permitido.
3. O contrato da fonte é validado antes da persistência.
4. O lote é normalizado pelas regras determinísticas existentes.
5. Entidades e relações são inseridas ou atualizadas em uma transação curta.
6. O cursor e os contadores avançam no mesmo commit.
7. O coletor aguarda o próximo intervalo e continua.
8. O aplicativo lê somente dados confirmados; nunca observa um lote parcialmente publicado.

## Tratamento de falhas

- Interrupção normal libera o trabalho atual quando possível; se não for possível, o lease expirará e permitirá retomada.
- Falhas temporárias preservam o cursor e agendam nova tentativa.
- Falhas permanentes marcam somente a tarefa afetada; outras fontes e anos continuam.
- Alterações incompatíveis no contrato oficial interrompem a fase correspondente com um código estável, sem persistir dados presumidos.
- Falta de espaço no banco interrompe novas escritas e deixa o progresso recuperável.
- O coletor verificará periodicamente o tamanho do banco e alertará ao atingir 70%, 80% e 90% dos 30 GB.
- A aplicação continuará exibindo a data da última atualização bem-sucedida para que o usuário não confunda dados antigos com dados atuais.

## Observabilidade operacional

Cada execução emitirá logs JSON com fonte, ano, fase, contagens, duração e código de resultado. URLs com credenciais, payloads integrais e segredos serão omitidos.

O comando de status deverá responder rapidamente sem depender das APIs externas. Também haverá uma consulta de integridade para detectar tarefas paradas, anos incompletos, relações órfãs e crescimento anormal do armazenamento.

## Segurança

- O processo web e o coletor usarão o usuário não administrador da aplicação.
- O administrador do Galaxy não será armazenado no ambiente do aplicativo.
- TLS será exigido para a conexão externa do Mac com o PostgreSQL.
- Rotas públicas continuarão sem acesso a comandos de importação ou migração.
- Senhas de usuários, sessões e acompanhamentos permanecerão exclusivamente no banco de produção e não serão copiados para desenvolvimento.
- Dados oficiais manterão URL e instante de extração para auditoria.

## Validação e critérios de aceite

A entrega só será considerada pronta quando:

- todo o projeto, tipos e automações locais funcionarem com Node.js 22;
- testes, verificação de tipos e build de produção passarem;
- o build standalone iniciar respeitando `PORT`;
- todas as migrações funcionarem tanto em banco vazio quanto no banco atual;
- o usuário não administrador conseguir migrar, ler e escrever sem privilégios de superusuário;
- testes comprovarem rate limiting, `Retry-After`, backoff, leases e retomada;
- repetir lotes e páginas não produzir duplicatas;
- uma interrupção forçada retomar do último commit;
- fotos eleitorais continuarem disponíveis sem disco persistente no contêiner;
- o aplicativo publicado passar pelo health check e por navegação manual das telas principais;
- amostras de Câmara e Senado forem comparadas às fontes oficiais;
- o coletor iniciar em produção, persistir progresso no Galaxy e continuar saudável após uma reinicialização local.

## Sequência de liberação

1. Padronizar e validar Node.js 22.
2. Implementar fila, leases, ritmo, status e armazenamento de fotos.
3. Aplicar migrações no banco do Galaxy com usuário próprio.
4. Publicar e validar o aplicativo sem iniciar carga pesada.
5. Iniciar o coletor com o ano corrente e observar os primeiros lotes.
6. Liberar a descida gradual até 1946.
7. Monitorar tamanho, erros e atualização das fontes durante a carga.

## Fora do escopo

- Importar eleições anteriores a 2026.
- Inferir votos individuais não publicados.
- Copiar para o banco todos os PDFs oficiais.
- Executar o histórico completo durante deploy ou startup.
- Criar recomendação, nota ou ranking político.
- Adicionar múltiplos contêineres, domínio personalizado ou armazenamento externo nesta primeira publicação.
