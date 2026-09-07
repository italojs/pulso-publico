# Votos individuais oficiais — desenho aprovado

## Objetivo

Recuperar votos individuais publicados pela Câmara mesmo quando a descrição da votação não usa o formato textual hoje reconhecido pelo aplicativo, sem inventar votos ausentes da fonte oficial.

## Decisões

- A existência de votos individuais será determinada pelo conteúdo oficial retornado, nunca por uma expressão regular aplicada à descrição.
- Na hidratação incremental, todo evento público será consultado no endpoint oficial de votos, com concorrência limitada.
- O histórico da Câmara de 2019 até o ano corrente será importado a partir dos arquivos anuais `votacoesVotos`, relacionando cada registro pelo identificador oficial da votação.
- Registros históricos só serão persistidos quando a votação correspondente já existir na base local.
- Deputados encontrados no arquivo histórico poderão ser criados como referências inativas; um cadastro ativo já existente nunca será rebaixado para inativo.
- A interface exibirá qualquer voto individual oficialmente publicado, mesmo quando o tipo nominal não puder ser inferido com segurança.
- Quando não houver registros individuais, a interface explicará que a fonte não os publicou e que isso costuma ocorrer em votações simbólicas.
- Votações secretas continuarão sem exposição de votos individuais.

## Fora do escopo

- Inferir como votou um parlamentar a partir de presença, orientação partidária ou fala em sessão.
- Tratar orientação de bancada como voto individual.
- Reclassificar automaticamente como nominal uma votação simbólica que tenha apenas declarações individuais isoladas.
