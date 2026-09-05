# Catálogo e análise de candidatos — design

## Objetivo

Criar uma área eleitoral separada da área de projetos para que uma pessoa leiga possa encontrar, conhecer, acompanhar e comparar candidatos registrados no TSE nas eleições de 2026. A experiência deve reunir fatos oficiais sem nota, ranking, rótulo ideológico, recomendação de voto ou indicação de vencedor.

## Escopo desta entrega

- Adicionar `Candidatos` ao menu superior, ao lado de `Projetos`.
- Criar o catálogo nacional em `/candidatos`.
- Criar a página analítica em `/candidatos/2026/[sqCandidate]`.
- Criar a comparação em `/candidatos/comparar?ano=2026&id=...`, limitada a três candidaturas do mesmo cargo e da mesma circunscrição.
- Importar os dados oficiais de candidatos de 2026, informações complementares, bens, coligações, redes sociais, fotos, propostas de governo e totais de prestação de contas.
- Relacionar uma candidatura ao parlamentar existente somente por vínculo confirmado.
- Permitir seguir candidatos somente com uma conta autenticada.
- Oferecer filtros padrão e um painel de filtros avançados. A exposição de todos os campos tecnicamente filtráveis fica fora desta entrega.

Não fazem parte desta entrega: interpretação de certidões, resumo de propostas por inteligência artificial, notas de desempenho, inferência ideológica, recomendação eleitoral, previsão de resultado e histórico de eleições anteriores a 2026 no catálogo eleitoral.

## Fontes e atualização

A fonte eleitoral é o [Portal de Dados Abertos do TSE — Candidatos 2026](https://dadosabertos.tse.jus.br/dataset/candidatos-2026), que publica candidatos, informações complementares, bens, coligações, vagas, motivos de cassação, redes sociais, fotos, propostas de governo e certidões. A fonte financeira é o conjunto [Prestação de Contas Eleitorais 2026](https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-2026).

O sincronizador eleitoral fará download dos arquivos oficiais em lote, validará o esquema, normalizará os registros e fará upsert idempotente. Uma execução incompleta não substitui o último retrato válido. Cada bloco público guarda a URL da fonte, a data de extração informada pelo arquivo e a data da última conferência local.

Em desenvolvimento, o catálogo usa candidaturas de 2026 e se relaciona com a janela parlamentar local de três anos. Em produção, o perfil relacionado usa todo o histórico parlamentar oficial disponível. A estrutura fica preparada para novas eleições, mas somente 2026 será importado nesta entrega.

## Modelo de dados

O módulo eleitoral é separado do módulo parlamentar atual:

- `electoral_candidates`: uma candidatura por eleição e `SQ_CANDIDATO`, com identidade pública, cargo, número, circunscrição, situação, partido, federação/coligação, dados de perfil declarados ao TSE, foto e metadados da fonte.
- `candidate_assets`: bens declarados, categoria, descrição pública, valor em centavos e metadados da fonte.
- `candidate_campaign_totals`: totais normalizados de receita, despesa, saldo e origem agregada dos recursos, todos em centavos.
- `candidate_social_links`: redes sociais declaradas ao TSE, com protocolo permitido e URL validada.
- `candidate_government_plans`: existência e link para o documento oficial. O conteúdo do PDF não será interpretado nesta entrega.
- `candidate_documents`: links oficiais para documentos públicos, incluindo certidões, sem classificação jurídica.
- `candidate_lawmaker_links`: relação com `lawmakers`, incluindo estado `pending`, `confirmed` ou `rejected`, método e evidência operacional. Somente `confirmed` é usado na interface pública.
- `followed_candidates`: relação entre conta e candidatura.
- `electoral_sync_runs`: estado, contagens, origem e falhas de cada sincronização.

CPF, título eleitoral, e-mail pessoal, endereço, número de processo e códigos internos sem valor para o cidadão não serão exibidos nem oferecidos como filtro. Arquivos brutos são temporários e não formam uma base pública paralela.

## Vínculo com Câmara e Senado

Uma correspondência por nome, partido ou UF nunca basta para publicar um vínculo. Regras automáticas podem criar candidatos a vínculo em estado `pending`; a publicação exige uma correspondência oficial inequívoca ou confirmação administrativa. Um vínculo incerto não mistura projetos, votos ou dados de mandato.

Quando não houver vínculo confirmado, a página informa apenas que não existe histórico parlamentar confirmado. Isso não significa falta de experiência política nem inatividade.

## Navegação e catálogo

O menu principal passa a apresentar `Projetos` e `Candidatos` lado a lado, antes das áreas pessoais `Seguindo`, `Alertas` e `Entrar`.

O catálogo abre com cartões contendo foto oficial, nome de urna, número, cargo, UF ou circunscrição, partido/federação, situação oficial da candidatura, data de atualização e indicadores de disponibilidade de proposta, finanças e histórico parlamentar confirmado. Os cartões não exibem nota, popularidade ou ordenação implícita por qualidade.

Consultar, filtrar, abrir perfis e comparar não exige login. Seguir um candidato redireciona para `/entrar?next=...` e, depois da autenticação, grava o acompanhamento somente na conta.

## Filtros padrão

O painel sempre visível replica o padrão já conhecido da área de projetos:

- busca por nome civil, nome de urna ou número;
- cargo;
- UF ou circunscrição;
- partido;
- ação `Aplicar`;
- ação `Filtros avançados`, com contador de filtros ativos.

Todos os filtros são representados na URL, sobrevivem à paginação e podem ser compartilhados. Filtros ativos aparecem como etiquetas removíveis.

## Filtros avançados desta entrega

O painel lateral no desktop e de tela cheia no celular é dividido em:

- **Eleição:** ano, turno, cargo, UF/circunscrição e situação da candidatura.
- **Organização política:** partido, federação e coligação.
- **Perfil informado ao TSE:** faixa etária, gênero, raça/cor, escolaridade e ocupação.
- **Patrimônio:** declarou bens, faixa de patrimônio total, quantidade e categorias de bens.
- **Campanha:** faixas de receita, despesa e saldo; predominância de recursos públicos, privados ou próprios.
- **Disponibilidade:** possui foto, redes sociais, proposta de governo, certidões, dados financeiros e histórico parlamentar confirmado.
- **Experiência confirmada:** Câmara ou Senado, mandato em exercício ou anterior e temas de atuação disponíveis.
- **Acompanhamento:** somente candidatos seguidos; exige login.
- **Ordenação:** nome, número, atualização, patrimônio, receita, despesa, projetos associados ou votações registradas.

O servidor valida quantidade de valores, intervalos, enumerações e tamanho do corpo das consultas. Uma combinação sem resultados mantém os filtros e orienta a remoção de critérios.

## UF estimada pelo IP

Em produção, quando a URL não contém UF, o servidor pode aceitar o código de região fornecido por um proxy de infraestrutura explicitamente confiável. O valor precisa ser uma UF brasileira válida. Cabeçalhos arbitrários enviados pelo cliente não são confiáveis.

A UF estimada é apenas um filtro inicial e aparece como etiqueta `UF estimada: XX`, com ações para alterar ou mostrar o Brasil inteiro. VPN, rede móvel ou ausência de cabeçalho podem impedir ou errar a estimativa. O IP bruto não é armazenado, enviado a um serviço externo nem usado como critério de acesso. Em localhost, nenhuma UF é presumida.

## Página analítica

A página responde, na ordem, quem é a pessoa, qual é a situação da candidatura, como a campanha é financiada e qual atuação parlamentar confirmada está disponível:

1. **Cabeçalho eleitoral:** foto, nome de urna, nome civil, número, cargo, UF/circunscrição, partido/federação, situação oficial, data da fonte, seguir e comparar.
2. **Dados declarados:** candidatura, coligação, tentativa de reeleição, escolaridade, ocupação, idade, gênero e raça/cor, todos identificados como informações prestadas ao TSE.
3. **Propostas:** link para a proposta oficial de governo quando publicada. Ausência de documento é informada sem inferência.
4. **Patrimônio:** total, quantidade e distribuição por categoria, com lista dos registros públicos.
5. **Campanha:** receita, despesa, saldo, composição agregada das fontes e principais categorias de gastos.
6. **Documentos e presença oficial:** redes sociais declaradas, certidões e links do TSE. Certidões são apenas disponibilizadas; não são resumidas ou interpretadas.
7. **Histórico parlamentar confirmado:** casa, período coberto, projetos, coautorias, temas, registros de votação e participação nominal disponível. A interface não chama ausência de registro de “falta”.
8. **Proveniência:** fonte e atualização por bloco, além de avisos claros para dados ausentes ou desatualizados.

Valores e percentuais são descritivos. Cores não codificam candidato “bom” ou “ruim”.

## Comparação

O usuário pode selecionar até três candidaturas. O servidor aceita a comparação somente quando ano, cargo e circunscrição são iguais. A página alinha os mesmos campos nas colunas: identidade eleitoral, situação, perfil declarado, patrimônio, finanças, documentos e, quando confirmado, atuação parlamentar.

Campos indisponíveis exibem `Não informado pela fonte`; não recebem zero. A ordem das colunas segue a ordem escolhida pelo usuário. Não existe vencedor, destaque automático ou conclusão gerada.

## Estados de erro e dados incompletos

- Falha temporária do TSE: manter o último retrato válido e mostrar sua data.
- Arquivo com esquema inesperado: rejeitar a execução inteira daquele recurso e registrar a falha.
- Foto ou documento indisponível: usar estado vazio e manter o link oficial quando houver.
- Finanças ainda não publicadas: mostrar `Ainda não disponibilizado pelo TSE`, não `R$ 0`.
- Vínculo parlamentar pendente: não consultar nem exibir atuação parlamentar.
- Filtro de seguidos sem sessão: responder `401 AUTH_REQUIRED` e encaminhar ao login preservando a URL.
- Comparação incompatível: rejeitar a combinação e explicar que os candidatos precisam disputar o mesmo cargo e circunscrição.

## Acessibilidade e apresentação

A área reutiliza tipografia, cores, espaçamento, painéis, etiquetas e controles do Pulso Público. Informações financeiras também aparecem como texto e tabela acessível; gráficos são complementares e nunca a única forma de transmitir valores. Painéis têm foco contido, fechamento por Escape, rótulos explícitos e navegação completa por teclado. O layout funciona em desktop e celular e respeita preferência por movimento reduzido.

## Verificação

- Testes de mapeamento com amostras oficiais anonimizadas de cada arquivo importado.
- Testes de idempotência, atualização e rejeição atômica de esquema inválido.
- Testes de consulta, contagem, ordenação, intervalos e combinações de filtros.
- Testes de serialização e leitura dos filtros pela URL.
- Testes do vínculo parlamentar, garantindo que `pending` e `rejected` nunca vazem dados.
- Testes de autenticação para seguir e filtrar acompanhados.
- Testes de comparação compatível e incompatível.
- Testes de componentes para estados completos, ausentes, desatualizados e responsivos.
- Typecheck, suíte completa, build de produção e validação manual no navegador do catálogo, painel avançado, perfil, comparação e fluxo de login.

## Critérios de aceite

- Uma pessoa consegue alternar entre Projetos e Candidatos pelo menu.
- O catálogo de 2026 funciona sem login e apresenta apenas fatos oficiais.
- Filtros padrão e avançados combinam, persistem na URL e paginam sem perder estado.
- A UF estimada é corrigível, removível e não depende de armazenar IP.
- O perfil diferencia dado ausente de valor zero.
- Patrimônio e campanha exibem fonte e atualização.
- Histórico parlamentar aparece somente com vínculo confirmado e informa o período coberto.
- Seguir candidato exige conta.
- A comparação aceita no máximo três candidatos compatíveis e não os pontua.
- Nenhuma tela recomenda voto, classifica ideologia ou declara um candidato superior.
