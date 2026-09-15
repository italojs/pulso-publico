# Dados, IA e privacidade

O aplicativo torna informação pública mais acessível, sem substituir os portais oficiais. É independente dos órgãos fornecedores. Não produz nota de políticos, ranking de candidaturas, recomendação de voto ou parecer jurídico.

## Fontes oficiais

| Fonte | Uso no aplicativo | Referência |
| --- | --- | --- |
| Câmara dos Deputados | Proposições, deputados, tramitações, autoria, temas e votações disponíveis. | [Dados Abertos da Câmara](https://dadosabertos.camara.leg.br/). |
| Senado Federal | Matérias, senadores, tramitações e votações disponíveis. | [API de Dados Abertos do Senado](https://legis.senado.leg.br/dadosabertos/). |
| Tribunal Superior Eleitoral | Candidaturas de 2026, complementos, bens, coligações, redes sociais, prestação de contas e mídia. | [Candidatos 2026 no Portal do TSE](https://dadosabertos.tse.jus.br/dataset/candidatos-2026) e [DivulgaCandContas](https://divulgacandcontas.tse.jus.br/divulga/). |

Os clientes usam endpoints oficiais configurados em `.env.example`; as cargas públicas não exigem chave de API dessas fontes. Links, identificadores e horários de conferência ou extração permitem verificar a origem. Datas de atualização representam a carga disponível, não uma promessa de tempo real. Verifique a fonte oficial antes de usar uma informação para uma decisão relevante.

## Fidelidade e limites

- Textos, situações e resultados oficiais são preservados. Facetas de busca e fases simplificadas são normalizações determinísticas, não juízo político.
- Ausência de campo não vira zero nem conclusão negativa. Zero permanece zero; informação ausente é apresentada como não informada quando aplicável.
- Câmara e Senado não são misturados; relações bicamerais dependem de identificação e evidência oficiais.
- Votos individuais dependem dos registros disponibilizados por cada Casa. Nem toda votação contém voto nominal.
- A presença e o histórico de projetos dependem da carga e da conferência realizadas; ausência no catálogo não prova ausência na fonte.
- O catálogo eleitoral usa o último retrato completo bem-sucedido. Uma carga rejeitada preserva o anterior, que pode ficar desatualizado.
- A execução eleitoral aceita somente 2026. Histórico de mandato no perfil de candidatura exige vínculo revisado e confirmado pelo operador.

Documentos legislativos e anexos permanecem na origem, com dados estruturados e links no banco. A ingestão eleitoral pode armazenar fotografias, propostas e certidões em sua geração de mídia; planeje acesso, retenção e persistência desses arquivos separadamente.

## IA opcional

Com `OPENAI_API_KEY` e `OPENAI_MODEL` configurados, o job de resumos pode gerar três campos de apresentação: título amigável, descrição curta e explicação de impacto prático (“Na prática:”). O impacto pode ser `null` quando a entrada não sustenta uma explicação concreta. Não há necessidade de IA para navegar, buscar, comparar candidaturas, criar conta ou acompanhar itens.

O provedor recebe identificação, título, ementa e o campo de texto oficial da entrada. No comando padrão `summaries`, esse campo atualmente contém a própria ementa armazenada, não uma garantia de extração do documento integral; a qualidade da explicação depende desse conteúdo. O prompt pede neutralidade, uso exclusivo da entrada e ausência de opinião, previsão ou recomendação. Modelo, versão de prompt, fingerprint e data ficam associados ao resultado. A saída tem validação estrutural, mas ainda pode conter erro ou omissão: o registro oficial continua sendo a referência.

O provedor atual envia requisições à API Responses com `store: false`. Isso não constitui, por si só, uma garantia sobre todas as políticas de retenção do serviço externo. Operadores devem avaliar as condições e os custos do provedor escolhido. O fluxo de resumo legislativo não precisa de senha, email de conta, sessão ou acompanhamentos do usuário; não acrescente esses dados à entrada.

Sem chave e modelo, a geração é ignorada e o app exibe texto oficial ou indicação de ausência. Aplicar filtros não faz requisições de IA. A demo não gera nem inclui descrições de IA.

## Privacidade e desenvolvimento

Contas, hashes de senha, sessões, acompanhamentos, alertas e assinaturas de push são dados operacionais, não parte dos conjuntos públicos. Seguir projetos, parlamentares ou candidaturas exige conta, com acompanhamentos isolados por usuário. Web Push é opcional e depende de adesão do usuário. Em desenvolvimento, `GEO_PROVIDER=none` evita sugerir UF com cabeçalhos de geolocalização do provedor.

A ingestão eleitoral usa listas explícitas de campos permitidos, e comandos de revisão de vínculos imprimem resultados sanitizados em vez de linhas brutas. Isso não torna todo conteúdo eleitoral desprovido de dados pessoais: nomes, fotos, documentos e outros campos públicos exigem cuidado proporcional ao uso.

Nunca envie ao GitHub dumps de produção, bases de usuários, CPFs, emails reais, sessões, tokens ou linhas eleitorais brutas. Reproduções e capturas devem usar dados fictícios ou sanitizados. Operadores de instâncias próprias são responsáveis por definir finalidade, acesso, retenção, atendimento a titulares e demais obrigações aplicáveis ao seu uso; este repositório não certifica conformidade jurídica.

## Licenças dos dados e da mídia

A [MIT do projeto](../LICENSE) cobre o código original, não concede novos direitos sobre dados de Câmara, Senado ou TSE, nem sobre fotografias, documentos ou marcas dessas origens. Disponibilidade pública não deve ser tratada como prova de domínio público ou permissão irrestrita de redistribuição.

Antes de republicar conjuntos ou mídia, consulte as condições atuais do recurso específico e preserve atribuição, proveniência e avisos exigidos. Respeite também eventuais direitos de terceiros e limitações sobre dados pessoais. Veja [avisos de terceiros](third-party-notices.md) para bibliotecas, fontes e binários.
