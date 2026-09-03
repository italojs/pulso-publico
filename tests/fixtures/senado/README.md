# Senado fixture provenance

Captured from the official Senado Federal Dados Abertos API on 2026-09-03.
Contact fields were removed because they are not part of the product contract.

- `processos.json`: `GET https://legis.senado.leg.br/dadosabertos/processo?sigla=PL&numero=2162&ano=2023`
- `processo.json`: `GET https://legis.senado.leg.br/dadosabertos/processo/8972241`
- `votacoes.json`: `GET https://legis.senado.leg.br/dadosabertos/votacao?idProcesso=8972241`
- `senadores.json`: `GET https://legis.senado.leg.br/dadosabertos/senador/lista/atual`

The current `/processo` and `/votacao` JSON APIs replace the deprecated legacy
`/materia` services. The senator list still uses the established wrapped JSON
contract.
