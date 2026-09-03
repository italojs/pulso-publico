import { describe, expect, it } from "vitest";

import processFixture from "../../fixtures/senado/processo.json" with { type: "json" };
import senatorFixture from "../../fixtures/senado/senadores.json" with { type: "json" };
import voteFixture from "../../fixtures/senado/votacoes.json" with { type: "json" };
import {
  mapSenadoAuthor,
  mapSenadoBill,
  mapSenadoIndividualVote,
  mapSenadoLawmaker,
  mapSenadoMovement,
  mapSenadoTopic,
  mapSenadoVoteEvent,
} from "#/integrations/senado/mapper";

const checkedAt = new Date("2026-09-03T18:00:00.000Z");

describe("Senado mapper", () => {
  it("normalizes a process while preserving official identity", () => {
    const bill = mapSenadoBill(processFixture, checkedAt);

    expect(bill).toMatchObject({
      source: "senado",
      externalId: "8972241",
      officialCode: "PL 2162/2023",
      congressionalKey: "pl:2162:2023",
      originHouse: "camara",
      currentHouse: "senado",
      statusCode: "VTDA",
    });
    expect(bill.presentedAt).toBe("2025-12-10T03:00:00.000Z");
    expect(bill.officialUrl).toContain("senado.leg.br");
  });

  it("maps institutional and parliamentary authors without guessing identities", () => {
    const institutional = mapSenadoAuthor(
      processFixture.documento.autoria[0],
      "8972241",
      checkedAt,
    );
    const parliamentarian = mapSenadoAuthor(
      {
        autor: "Alan Rick",
        siglaTipo: "SENADOR",
        descricaoTipo: "SENADOR",
        ordem: 1,
        codigoParlamentar: 5672,
        siglaPartido: "REPUBLICANOS",
      },
      "9000000",
      checkedAt,
    );

    expect(institutional.lawmakerExternalId).toBeNull();
    expect(parliamentarian).toMatchObject({
      lawmakerExternalId: "5672",
      party: "REPUBLICANOS",
      isPrimary: true,
    });
  });

  it("maps an official classification as a topic", () => {
    const topic = mapSenadoTopic(processFixture.classificacoes[0], "8972241", checkedAt);
    expect(topic).toMatchObject({
      externalId: "8972241:33805617",
      label: "Direito Penal e Penitenciário",
    });
  });

  it("maps a legislative movement with its official identifier", () => {
    const movement = mapSenadoMovement(
      processFixture.autuacoes[0]!.informesLegislativos[0]!,
      "8972241",
      0,
      checkedAt,
    );

    expect(movement).toMatchObject({
      externalId: "2268789",
      bodyCode: "PLEN",
      statusCode: "AGDESP",
    });
    expect(movement.occurredAt).toBe("2025-12-10T10:03:21.000Z");
  });

  it("maps nominal vote events and their individual votes", () => {
    const rawVote = voteFixture[0]!;
    const vote = mapSenadoVoteEvent(rawVote, "8972241", checkedAt);
    const individual = mapSenadoIndividualVote(
      rawVote.votos[1],
      vote.externalId,
      checkedAt,
    );

    expect(vote).toMatchObject({
      externalId: "8972241:7041",
      result: "aprovada",
      isNominal: true,
      isSecret: false,
    });
    expect(individual).toMatchObject({
      lawmakerExternalId: "6358",
      choice: "nao",
      rawChoice: "Não",
    });
  });

  it("maps a current senator without contact fields", () => {
    const raw = senatorFixture.ListaParlamentarEmExercicio.Parlamentares.Parlamentar[0];
    const senator = mapSenadoLawmaker(raw, checkedAt);

    expect(senator).toMatchObject({
      externalId: "5672",
      name: "Alan Rick Miranda",
      electoralName: "Alan Rick",
      role: "senador",
      party: "REPUBLICANOS",
      region: "AC",
      active: true,
    });
  });
});
