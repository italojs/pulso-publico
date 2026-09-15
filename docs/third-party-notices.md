# Avisos de terceiros

A [licença MIT](../LICENSE) aplica-se ao código original do Pulso Público. Bibliotecas, fontes tipográficas, binários, dados e mídia de terceiros conservam suas próprias licenças e direitos. Este inventário registra declarações encontradas em `package-lock.json` e nos metadados/arquivos de licença dos pacotes instalados da versão `0.1.0`, consultados em 2026-09-15; não é parecer jurídico, certificação de compatibilidade ou auditoria de segurança.

## Dependências diretas de execução

| Pacote | Versão no lockfile | Licença declarada |
| --- | --- | --- |
| `@fontsource-variable/atkinson-hyperlegible-next` | 5.3.0 | OFL-1.1 |
| `@fontsource/barlow-condensed` | 5.3.0 | OFL-1.1 |
| `@js-temporal/polyfill` | 0.5.1 | ISC |
| `csv-parse` | 7.0.2 | MIT |
| `drizzle-orm` | 0.45.2 | Apache-2.0 |
| `next` | 16.3.4 | MIT |
| `postgres` | 3.4.9 | Unlicense |
| `react` | 19.2.8 | MIT |
| `react-dom` | 19.2.8 | MIT |
| `unzipper` | 0.12.5 | MIT |
| `web-push` | 3.6.7 | MPL-2.0 |
| `zod` | 4.5.4 | MIT |

## Dependências diretas de desenvolvimento

| Pacote | Versão no lockfile | Licença declarada |
| --- | --- | --- |
| `@testing-library/dom` | 10.4.1 | MIT |
| `@testing-library/jest-dom` | 7.0.1 | MIT |
| `@testing-library/react` | 16.3.3 | MIT |
| `@types/node` | 22.20.2 | MIT |
| `@types/react` | 19.2.18 | MIT |
| `@types/react-dom` | 19.2.7 | MIT |
| `@types/unzipper` | 0.10.11 | MIT |
| `@types/web-push` | 3.6.4 | MIT |
| `dotenv` | 17.4.2 | BSD-2-Clause |
| `drizzle-kit` | 0.31.10 | MIT |
| `jsdom` | 30.0.1 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |
| `tsx` | 4.23.13 | MIT |
| `vitest` | 5.0.0 | MIT |

Versões e licenças devem ser conferidas novamente ao atualizar o lockfile. Os textos completos ficam nos arquivos `LICENSE`, `COPYING` ou equivalentes de cada pacote instalado; preserve também arquivos `NOTICE` quando existentes. A tabela não substitui esses textos nem relaciona todas as dependências transitivas.

## Fontes tipográficas

O layout importa as fontes localmente via Fontsource:

- Atkinson Hyperlegible Next: copyright 2020–2024 The Atkinson Hyperlegible Next Project Authors. Distribuída sob SIL Open Font License 1.1; veja o [LICENSE da fonte no Fontsource](https://github.com/fontsource/font-files/blob/main/fonts/variable/atkinson-hyperlegible-next/LICENSE).
- Barlow Condensed: copyright 2017 The Barlow Project Authors. Distribuída sob SIL Open Font License 1.1; veja o [LICENSE da fonte no Fontsource](https://github.com/fontsource/font-files/blob/main/fonts/google/barlow-condensed/LICENSE).

As cópias instaladas incluem o texto da OFL e os avisos de copyright. Preserve-os ao distribuir os arquivos de fonte, inclusive em artefatos web. Fontes não passam a ser MIT por serem usadas nesta aplicação; observe as condições da OFL para redistribuição, modificações e eventuais nomes reservados.

## Dependências transitivas e binários

O lockfile inclui declarações permissivas (como MIT, ISC, BSD e Apache-2.0), além de OFL-1.1, MPL-2.0, LGPL-3.0-or-later e CC-BY-4.0. Não trate o conjunto como “somente MIT”. Entradas opcionais de várias plataformas podem constar no lockfile mesmo sem instalação no sistema atual; examine o artefato efetivamente distribuído.

Pontos importantes no snapshot:

| Componente | Declaração no lockfile | Observação |
| --- | --- | --- |
| `sharp` | Apache-2.0 | Biblioteca de imagem usada transitivamente; [licenciamento oficial](https://sharp.pixelplumbing.com/#licensing). |
| Dez pacotes `@img/sharp-libvips-*` | LGPL-3.0-or-later | Binários de libvips e dependências para diferentes plataformas. |
| `@img/sharp-wasm32` | Apache-2.0 AND LGPL-3.0-or-later AND MIT | Composição de licenças, não uma escolha única entre elas. |
| Três pacotes `@img/sharp-win32-*` | Apache-2.0 AND LGPL-3.0-or-later | Binários Windows com componentes de licenças distintas. |
| `lightningcss` e variantes de plataforma | MPL-2.0 | Junto com `web-push`, totalizam 13 entradas MPL no snapshot. |
| `caniuse-lite` | CC-BY-4.0 | Dados de compatibilidade com atribuição própria. |

Ao distribuir contêineres, executáveis ou o build standalone com binários de libvips, revise as condições LGPL e a composição das bibliotecas incluídas, preserve avisos e disponibilize o material exigido pela forma de distribuição. Consulte o [projeto sharp-libvips](https://github.com/lovell/sharp-libvips), os metadados de `@img/sharp-libvips-*` e os arquivos de licença correspondentes; a [documentação de instalação do sharp](https://sharp.pixelplumbing.com/install/#prebuilt-binaries) explica a seleção por plataforma.

Arquivos cobertos pela MPL, como os do [web-push](https://github.com/web-push-libs/web-push/blob/v3.6.7/LICENSE), também mantêm suas condições ao serem modificados ou redistribuídos. Para `lightningcss` e `caniuse-lite`, confira respectivamente `node_modules/lightningcss/LICENSE` e `node_modules/caniuse-lite/LICENSE` após a instalação. Publicar apenas o código original MIT não elimina obrigações se você também distribuir arquivos de terceiros.

## Dados oficiais, mídia e marcas

Dados e documentos de Câmara, Senado e TSE não são relicenciados pelo projeto. Fotografias de candidatos, propostas, certidões, logotipos e marcas podem envolver direitos e condições próprios; disponibilidade pública não prova domínio público. Consulte [dados e IA](data-and-ai.md) e as condições de cada recurso antes de republicar.

Este repositório não deve conter dumps de produção, contas reais ou arquivos eleitorais completos. A captura de demo e os exemplos sintéticos foram separados dos dados oficiais para facilitar experimentação sem redistribuir pessoas ou registros reais.
