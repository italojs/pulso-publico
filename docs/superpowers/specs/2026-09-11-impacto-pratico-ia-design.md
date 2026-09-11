# Explicações de impacto prático por IA

## Objetivo

Adicionar uma explicação curta e neutra sobre o efeito prático de cada projeto para pessoas sem familiaridade com política. A explicação não avalia a proposta nem prevê seus resultados: descreve mudanças e exemplos que estejam diretamente respaldados pelo texto oficial.

O primeiro lote terá 600 projetos: os 100 projetos mais recentes que já possuem resumo por IA e os 500 seguintes, todos ordenados por atividade legislativa no instante em que o lote for iniciado.

## Experiência no produto

Na página detalhada de um projeto, o cartão já identificado como `Gerado por IA` terá duas partes:

1. título e resumo em linguagem simples;
2. `O que muda na prática`, com um parágrafo de 80 a 520 caracteres.

O feed continuará mostrando somente o título e o resumo. Isso preserva leitura rápida e evita transformar cartões de listagem em texto longo.

O cartão exibirá a nota: `Explicação gerada por IA a partir de registros oficiais. Confira a fonte original.` O título, ementa, tramitação e votos continuam separados como conteúdo oficial.

Quando não houver conteúdo oficial suficiente para explicar um efeito concreto, a seção não será exibida. Nenhum exemplo será inferido ou inventado.

## Dados e versionamento

`ai_summaries` receberá a coluna opcional `practical_impact`. O campo pertence ao resumo gerado, e não ao projeto oficial, porque é uma explicação derivada.

O resumo passará a usar a versão `plain-language-full-text-v3`. A impressão digital incluirá o código, título, ementa, versão do prompt e o hash SHA-256 do texto integral usado. Assim, uma mudança no documento oficial torna o resumo identificável como desatualizado.

Será criada uma tabela de itens de lote de IA. Cada item registra:

- projeto e posição congelada no recorte;
- versão de geração;
- estado `pending`, `processing`, `completed`, `needs_review` ou `failed`;
- hash do documento oficial, número de tentativas, motivo de falha e datas.

O par `(bill_id, prompt_version)` será único. Um lote interrompido pode retomar apenas itens pendentes. Itens sem texto legível permanecem em `needs_review`; o resumo anterior nunca é apagado por uma falha.

## Formação do lote

No início, uma consulta ordena os projetos por sua última movimentação, última votação ou apresentação, da mais recente para a mais antiga. Os primeiros 600 IDs e suas posições são persistidos nos itens de lote antes de qualquer busca de documento. Chegadas posteriores de novos projetos não alteram esse conjunto.

Os 100 que já têm `plain-language-full-text-v2` serão atualizados para v3, com o novo campo. Os 500 seguintes receberão título, resumo e impacto prático na mesma geração.

## Fontes e geração

Para cada projeto, o processamento busca primeiro os dados oficiais da Câmara ou do Senado e o documento associado. O texto extraído de PDF é a base da explicação; quando a extração falhar, páginas do PDF podem ser conferidas visualmente. Os limites de cada fonte são respeitados, com no máximo 20 requisições por minuto por origem.

O modelo usado será o Codex local `gpt-5.6-terra` em esforço médio, sem `OPENAI_API_KEY` e sem chamadas a APIs externas de IA. A instrução exige:

- linguagem simples, neutra e brasileira;
- resumo factual, sem recomendação política;
- exemplos apenas explícitos ou consequência direta da regra proposta;
- indicação de condição relevante quando a mudança depender de regulamentação, aprovação ou outra etapa;
- ausência de conteúdo adicional quando a fonte for insuficiente.

Cada resposta é validada antes de persistir: título entre 8 e 120 caracteres, resumo entre 80 e 420, impacto entre 80 e 520. Conteúdo fora desses limites ou sem apoio no texto oficial é marcado para revisão, sem substituir a versão existente.

## Componentes afetados

- Migração Drizzle para o novo campo e tabela de itens de lote.
- Esquema e repositório de resumos, incluindo a nova versão e fingerprint integral.
- Leitura pública para transportar `practicalImpact` até a página detalhada.
- Página do projeto e testes de interface para mostrar ou ocultar corretamente a seção.
- Script operacional para congelar o lote, buscar documentos de forma limitada, registrar checkpoints e emitir trabalho para a geração pelo Codex local.

## Falhas e observabilidade

O script informará, sem dados sensíveis: quantidade planejada, concluída, pendente, em revisão, falhada, documentos sem texto e tempo entre solicitações. Não executará geração sem um limite explícito de itens.

Ao fim, a validação confere que há exatamente 600 itens no lote e reporta a distribuição de estados. A verificação manual inclui o PL 1159/2026 e exemplos de Câmara e Senado, além de checar que o impacto não aparece no feed.

## Testes

- Migração: coluna, tabela, índices e restrição de unicidade.
- Repositório: leitura/gravação de impacto e fingerprint do texto integral.
- Seleção: recorte de 600 congelado e retomada sem duplicidade.
- Interface: seção aparece somente quando há impacto; rótulo de IA e fonte oficial permanecem claros.
- Script: limites de tamanho, estados de erro e intervalo de requisições.

## Fora de escopo

- Reprocessar os 25.197 projetos existentes.
- Exibir impacto prático diretamente no feed.
- Usar a explicação como avaliação, ranking ou recomendação eleitoral.
- Gerar conteúdo por API externa de IA.
