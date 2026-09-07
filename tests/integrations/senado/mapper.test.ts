import { describe, expect, it } from "vitest";

import processFixture from "../../fixtures/senado/processo.json" with { type: "json" };
import processesFixture from "../../fixtures/senado/processos.json" with { type: "json" };
import senatorFixture from "../../fixtures/senado/senadores.json" with { type: "json" };
import voteFixture from "../../fixtures/senado/votacoes.json" with { type: "json" };
import {
  mapSenadoAuthor,
  mapSenadoBill,
  mapSenadoCatalogAuthor,
  mapSenadoIndividualVote,
  mapSenadoLawmaker,
  mapSenadoLawmakerDetail,
  mapSenadoMovement,
  mapSenadoTopic,
  mapSenadoVoteEvent,
} from "#/integrations/senado/mapper";

const checkedAt = new Date("2026-09-03T18:00:00.000Z");

describe("Senado mapper", () => {
  it("preserves catalog authorship without inventing a parliamentarian identity", () => {
    const author = mapSenadoCatalogAuthor(processesFixture[0], "8972241", checkedAt);

    expect(author).toMatchObject({
      officialName: "Câmara dos Deputados",
      lawmakerExternalId: null,
      isPrimary: true,
    });
  });

  it("normalizes a process while preserving official identity", () => {
    const bill = mapSenadoBill(processFixture, checkedAt);

    expect(bill).toMatchObject({
      source: "senado",
      externalId: "8972241",
      officialCode: "PL 2162/2023",
      proposalType: "PL",
      proposalNumber: 2162,
      proposalYear: 2023,
      congressionalKey: "pl:2162:2023",
      originHouse: "camara",
      currentHouse: "senado",
      statusCode: "VTDA",
    });
    expect(bill.presentedAt).toBe("2025-12-10T03:00:00.000Z");
    expect(bill.officialUrl).toContain("senado.leg.br");
  });

  it("accepts the official commission suffix used by Senate requests", () => {
    const bill = mapSenadoBill(
      {
        id: 9101550,
        codigoMateria: 175629,
        identificacao: "REQ 15/2026 - CMA",
        casaIdentificadora: "SF",
        dataApresentacao: "2026-09-01",
        ementa: "Requer a realização de audiência pública.",
        situacaoAtual: "PRONTA PARA A PAUTA NA COMISSÃO",
      },
      checkedAt,
    );

    expect(bill).toMatchObject({
      officialCode: "REQ 15/2026",
      congressionalKey: "req:15:2026",
      officialTitle: "REQ 15/2026 - CMA",
    });
  });

  it("accepts the official substitute suffix used by Senate bills", () => {
    const bill = mapSenadoBill(
      {
        id: 8957659,
        codigoMateria: 171682,
        identificacao: "PLP 124/2022 (Substitutivo-CD)",
        casaIdentificadora: "SF",
        dataApresentacao: "2025-10-22",
        ementa: "Substitutivo da Câmara dos Deputados.",
        situacaoAtual: "AGUARDANDO DESPACHO",
      },
      checkedAt,
    );

    expect(bill).toMatchObject({
      officialCode: "PLP 124/2022",
      officialTitle: "PLP 124/2022 (Substitutivo-CD)",
    });
  });

  it("preserves an official alphabetic suffix in a Senate proposal number", () => {
    const bill = mapSenadoBill(
      {
        id: 7715241,
        codigoMateria: 135142,
        identificacao: "RQS 11A/2019",
        numero: 11,
        ano: 2019,
        casaIdentificadora: "SF",
        dataApresentacao: "2019-02-11",
        ementa: "Requerimento oficial com sufixo alfabético.",
        situacaoAtual: "ARQUIVADA",
      },
      checkedAt,
    );

    expect(bill).toMatchObject({
      officialCode: "RQS 11A/2019",
      proposalType: "RQS",
      proposalNumber: 11,
      proposalYear: 2019,
      congressionalKey: "rqs:11a:2019",
    });
  });

  it.each(["R.C", "R.S"])("accepts the real official Senate type %s", (sigla) => {
    const bill = mapSenadoBill({
      ...processFixture,
      id: `${processFixture.id}-${sigla}`,
      codigoMateria: `${processFixture.codigoMateria}-${sigla}`,
      identificacao: `${sigla} 1/2026`,
      sigla,
      numero: 1,
      ano: 2026,
    }, checkedAt);

    expect(bill).toMatchObject({
      officialCode: `${sigla} 1/2026`,
      proposalType: sigla,
      proposalNumber: 1,
      proposalYear: 2026,
    });
  });

  it("degrades an unrecognized structured Senate type without rejecting the process", () => {
    const bill = mapSenadoBill({
      ...processFixture,
      identificacao: "TIPO/INTERNO 1/2026",
      sigla: "TIPO/INTERNO",
      numero: 1,
      ano: 2026,
    }, checkedAt);

    expect(bill).toMatchObject({
      officialCode: "TIPO/INTERNO 1/2026",
      proposalType: null,
      proposalNumber: 1,
      proposalYear: 2026,
    });
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
      externalId: "8972241:2268789",
      bodyCode: "PLEN",
      statusCode: "AGDESP",
    });
    expect(
      mapSenadoMovement(
        processFixture.autuacoes[0]!.informesLegislativos[0]!,
        "another-bill",
        0,
        checkedAt,
      ).externalId,
    ).not.toBe(movement.externalId);
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

  it("maps a historical senator detail as inactive", () => {
    const identification =
      senatorFixture.ListaParlamentarEmExercicio.Parlamentares.Parlamentar[0]!
        .IdentificacaoParlamentar;
    const senator = mapSenadoLawmakerDetail(
      {
        DetalheParlamentar: {
          Parlamentar: { IdentificacaoParlamentar: identification },
        },
      },
      checkedAt,
    );

    expect(senator).toMatchObject({ externalId: "5672", active: false });
  });
});
