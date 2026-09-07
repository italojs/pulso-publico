# Validação — votos individuais oficiais

Data: 7 de setembro de 2026

## Resultado

- A hidratação passou a consultar todos os eventos públicos em lotes de até oito chamadas.
- O arquivo anual `votacoesVotos` passou a ser importado em lotes de 500 registros, com checkpoint independente por ano.
- O backfill local de 2019 a 2026 terminou com status `complete` nos oito anos.
- A base local contém 4.564 votos individuais depois do backfill.
- A votação `2233802-401`, anteriormente escondida pelo classificador textual, agora possui os 38 registros oficiais: 34 votos “Sim” e 4 votos “Não”.
- A interface mostra qualquer lista oficial existente mesmo quando `isNominal` não pôde ser inferido pelo texto.
- Eventos públicos vazios explicam que a fonte não registrou votos individuais e que isso costuma ocorrer em votações simbólicas.

## Backfill

Comando:

```sh
npm run backfill:votes -- --from=2019
```

Registros lidos e relacionados a votações locais:

| Ano | Lidos | Relacionados |
| --- | ---: | ---: |
| 2019 | 120.952 | 0 |
| 2020 | 159.717 | 0 |
| 2021 | 322.191 | 0 |
| 2022 | 197.189 | 31 |
| 2023 | 128.653 | 488 |
| 2024 | 116.400 | 0 |
| 2025 | 175.067 | 508 |
| 2026 | 51.832 | 3.213 |

Os anos com zero indicam que nenhum identificador de votação daquele arquivo anual existia na amostra de projetos detalhados da base local; não representam falha de importação.

## Testes automatizados

```text
Test Files  58 passed (58)
Tests       704 passed (704)
```

Também passaram:

```sh
npm run typecheck
npm run build
```

O build de produção do Next.js 16.3.4 compilou, validou TypeScript e gerou as 15 páginas sem erros.

## Validação manual

Página: `http://127.0.0.1:3000/projetos/senado/9056435`

- A votação `2233802-401` exibe “Ver 38 votos individuais”.
- Uma votação sem registros individuais exibe “A fonte oficial não registrou votos individuais para esta votação. Isso costuma ocorrer em votações simbólicas.”
- A separação das votações por Câmara e Senado permaneceu visível.
