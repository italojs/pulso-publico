import { describe, expect, it } from "vitest";

import authorFixture from "../../fixtures/camara/autores.json" with { type: "json" };
import billFixture from "../../fixtures/camara/proposicao.json" with { type: "json" };
import lawmakerFixture from "../../fixtures/camara/deputados.json" with { type: "json" };
import movementFixture from "../../fixtures/camara/tramitacoes.json" with { type: "json" };
import topicFixture from "../../fixtures/camara/temas.json" with { type: "json" };
import voteFixture from "../../fixtures/camara/votacoes.json" with { type: "json" };
import individualVoteFixture from "../../fixtures/camara/votos.json" with { type: "json" };
import {
  mapCamaraAuthor,
  mapCamaraBill,
  mapCamaraIndividualVote,
  mapCamaraLawmaker,
  mapCamaraLawmakerDetail,
  mapCamaraMovement,
  mapCamaraTopic,
  mapCamaraVoteEvent,
} from "#/integrations/camara/mapper";

const checkedAt = new Date("2026-09-03T18:00:00.000Z");

describe("Câmara mapper", () => {
  it("preserves official bill provenance and cross-house status", () => {
    const result = mapCamaraBill(billFixture.dados, checkedAt);

    expect(result).toMatchObject({
      source: "camara",
      externalId: "2351249",
      officialCode: "PL 1106/2023",
      proposalType: "PL",
      proposalNumber: 1106,
      proposalYear: 2023,
      congressionalKey: "pl:1106:2023",
      currentHouse: "senado",
      statusCode: "926",
    });
    expect(result.officialUrl).toBe(
      "https://www.camara.leg.br/propostas-legislativas/2351249",
    );
    expect(result.presentedAt).toBe("2023-03-14T14:46:00.000Z");
  });

  it("keeps official structured identity when its type has an adopted-text suffix", () => {
    const result = mapCamaraBill({
      ...billFixture.dados,
      siglaTipo: "SBT-A",
      numero: 3,
      ano: 2026,
    }, checkedAt);

    expect(result).toMatchObject({
      officialCode: "SBT-A 3/2026",
      proposalType: "SBT-A",
      proposalNumber: 3,
      proposalYear: 2026,
    });
  });

  it("creates a deterministic movement id", () => {
    const raw = movementFixture.dados[0];
    const movement = mapCamaraMovement(raw, "2351249", checkedAt);

    expect(movement.externalId).toBe(
      mapCamaraMovement(raw, "2351249", checkedAt).externalId,
    );
    expect(movement.officialDescription).toContain("Remessa ao Senado Federal");
  });

  it("maps authors and topics to stable bill-scoped identities", () => {
    const author = mapCamaraAuthor(authorFixture.dados[0], "2351249", checkedAt);
    const topic = mapCamaraTopic(topicFixture.dados[0], "2351249", checkedAt);

    expect(author).toMatchObject({
      lawmakerExternalId: "204485",
      externalId: "2351249:1:204485",
      isPrimary: true,
    });
    expect(topic).toMatchObject({ externalId: "2351249:46", label: "Educação" });
  });

  it("recognizes a nominal vote and preserves its official result", () => {
    const vote = mapCamaraVoteEvent(voteFixture.dados[0], "2379032", checkedAt);

    expect(vote).toMatchObject({
      externalId: "2579999-8",
      isNominal: true,
      isSecret: false,
      result: "rejeitada",
    });
  });

  it("normalizes an individual vote without losing the original label", () => {
    const vote = mapCamaraIndividualVote(
      individualVoteFixture.dados[0],
      "2579999-8",
      checkedAt,
    );

    expect(vote).toMatchObject({
      lawmakerExternalId: "73788",
      choice: "sim",
      rawChoice: "Sim",
    });
  });

  it("marks a nominal vote with no published choice as unavailable", () => {
    const vote = mapCamaraIndividualVote(
      {
        ...individualVoteFixture.dados[0],
        tipoVoto: null,
      },
      "2579999-8",
      checkedAt,
    );

    expect(vote).toMatchObject({
      choice: "indisponivel",
      rawChoice: "Não informado pela fonte",
    });
  });

  it("maps an active federal deputy", () => {
    const lawmaker = mapCamaraLawmaker(lawmakerFixture.dados[0], checkedAt);

    expect(lawmaker).toMatchObject({
      externalId: "204379",
      electoralName: "Acácio Favacho",
      role: "deputado_federal",
      region: "AP",
      active: true,
    });
  });

  it("maps a former deputy from the official detail response", () => {
    const lawmaker = mapCamaraLawmakerDetail(
      {
        id: 220579,
        uri: "https://dadosabertos.camara.leg.br/api/v2/deputados/220579",
        nomeCivil: "Silvia Nobre Lopes",
        ultimoStatus: {
          id: 220579,
          uri: "https://dadosabertos.camara.leg.br/api/v2/deputados/220579",
          nome: "Silvia Waiãpi",
          nomeEleitoral: "Silvia Waiãpi",
          siglaPartido: "PL",
          siglaUf: "AP",
          urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/220579.jpg",
          situacao: "Suplência",
        },
      },
      checkedAt,
    );

    expect(lawmaker).toMatchObject({
      externalId: "220579",
      name: "Silvia Nobre Lopes",
      electoralName: "Silvia Waiãpi",
      active: false,
    });
  });
});
