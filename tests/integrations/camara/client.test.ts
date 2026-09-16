import { describe, expect, it } from "vitest";

import billListFixture from "../../fixtures/camara/proposicoes.json" with { type: "json" };
import { CamaraAdapter } from "#/integrations/camara/client";
import { OfficialSourceError } from "#/server/http/retrying-fetch";

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("CamaraAdapter", () => {
  it("rejects genuinely ambiguous acts instead of silently overwriting one", async () => {
    const movement = {
      sequencia: 407, dataHora: "2026-05-27T15:00", siglaOrgao: "PLEN",
      descricaoTramitacao: "Discussão (Plenário)", codTipoTramitacao: 222,
      despacho: "Discussão em primeiro turno.",
    };
    const adapter = new CamaraAdapter({
      baseUrl: "https://camara.test/api/v2",
      now: () => new Date("2026-09-15T15:00:00Z"),
      fetcher: async () => jsonResponse({ dados: [movement, { ...movement, despacho: "Outro ato de discussão." }], links: [] }),
    });
    await expect(adapter.listBillMovements("2233802")).rejects.toMatchObject({
      name: "OfficialSourceError", retryable: false, status: null,
    });
  });

  it("preserves distinct PEC acts sharing a sequence without changing unambiguous movement IDs", async () => {
    const base = {
      sequencia: 407,
      dataHora: "2026-05-27T15:00",
      siglaOrgao: "PLEN",
      uriOrgao: "https://dadosabertos.camara.leg.br/api/v2/orgaos/180",
      regime: "Especial",
      descricaoSituacao: "Aguardando Envio ao Senado Federal",
      codSituacao: 1293,
      url: null,
    };
    const discussion = {
      ...base,
      descricaoTramitacao: "Discussão (Plenário)",
      codTipoTramitacao: 222,
      despacho: "Discussão em primeiro turno.",
    };
    const request = {
      ...base,
      descricaoTramitacao: "Aprovação de Requerimento",
      codTipoTramitacao: 195,
      despacho: "Aprovado o requerimento nº 3223/2026, que solicita dispensa de interstício.",
    };
    const unambiguous = { ...discussion, sequencia: 408, despacho: "Discussão em segundo turno." };
    const collect = async (dados: unknown[], checkedAt: string) => {
      const adapter = new CamaraAdapter({
        baseUrl: "https://camara.test/api/v2",
        now: () => new Date(checkedAt),
        fetcher: async () => jsonResponse({ dados, links: [] }),
      });
      return adapter.listBillMovements("2233802");
    };

    const movements = await collect([request, discussion, discussion, unambiguous], "2026-09-15T15:00:00Z");
    const reversed = await collect([unambiguous, discussion, request], "2026-09-16T15:00:00Z");

    expect(movements).toHaveLength(3);
    expect(new Set(movements.map((movement) => movement.externalId)).size).toBe(3);
    expect(movements.find((movement) => movement.officialDescription === "Discussão em primeiro turno.")?.externalId)
      .toBe("2233802:407:2026-05-27T15:00:PLEN");
    expect(movements.find((movement) => movement.officialDescription === "Discussão em segundo turno.")?.externalId)
      .toBe("2233802:408:2026-05-27T15:00:PLEN");
    expect(movements.find((movement) => movement.officialDescription === request.despacho)?.externalId)
      .toBe("2233802:407:2026-05-27T15:00:PLEN:tipo:195");
    expect(movements.map(({ externalId, officialDescription }) => ({ externalId, officialDescription }))
      .sort((a, b) => a.externalId.localeCompare(b.externalId)))
      .toEqual(reversed.map(({ externalId, officialDescription }) => ({ externalId, officialDescription }))
        .sort((a, b) => a.externalId.localeCompare(b.externalId)));

    const corrected = await collect([
      { ...request, despacho: "Aprovado o requerimento nº 3223/2026, com redação corrigida.", codSituacao: 926 },
      discussion, unambiguous,
    ], "2026-09-17T15:00:00Z");
    const stored = new Map(movements.map((movement) => [movement.externalId, movement]));
    for (const movement of corrected) stored.set(movement.externalId, movement);
    expect(stored.size).toBe(3);
    expect(stored.get("2233802:407:2026-05-27T15:00:PLEN:tipo:195")?.officialDescription)
      .toBe("Aprovado o requerimento nº 3223/2026, com redação corrigida.");

    const expanded = await collect([
      discussion, request, unambiguous,
      { ...discussion, codTipoTramitacao: 300, despacho: "Novo ato com a mesma sequência." },
    ], "2026-09-18T15:00:00Z");
    for (const movement of expanded) stored.set(movement.externalId, movement);
    expect(stored.size).toBe(4);
    expect([...stored.values()].map((movement) => movement.officialDescription).sort())
      .toEqual([request.despacho, discussion.despacho, unambiguous.despacho, "Novo ato com a mesma sequência."].sort());
  });

  it("finds a proposition by exact official type, number and year", async () => {
    const requestedUrls: URL[] = [];
    const adapter = new CamaraAdapter({
      baseUrl: "https://camara.test/api/v2",
      fetcher: async (url) => {
        requestedUrls.push(url);
        return jsonResponse({
          dados: [{
            ...billListFixture.dados[0],
            id: 2233802,
            siglaTipo: "PEC",
            numero: 221,
            ano: 2019,
            dataApresentacao: "2019-10-15T19:12",
          }],
          links: [],
        });
      },
    });

    const bills = await adapter.findBillsByOfficialIdentity({
      proposalType: "pec",
      proposalNumber: 221,
      proposalYear: 2019,
    });

    expect(bills.map((bill) => bill.externalId)).toEqual(["2233802"]);
    expect(requestedUrls[0]?.searchParams.get("siglaTipo")).toBe("PEC");
    expect(requestedUrls[0]?.searchParams.get("numero")).toBe("221");
    expect(requestedUrls[0]?.searchParams.get("ano")).toBe("2019");
  });

  it("uses official pagination links before advancing the bounded day window", async () => {
    const requestedUrls: string[] = [];
    const pageTwoUrl =
      "https://camara.test/api/v2/proposicoes?dataInicio=2026-09-02&dataFim=2026-09-02&pagina=2&itens=100";
    const responses = [
      {
        dados: billListFixture.dados.map((item) => ({
          ...item,
          dataApresentacao: "2026-09-02T16:00",
        })),
        links: [{ rel: "next", href: pageTwoUrl }],
      },
      { dados: [], links: [] },
      { dados: [], links: [] },
    ];
    const adapter = new CamaraAdapter({
      baseUrl: "https://camara.test/api/v2",
      now: () => new Date("2026-09-03T18:00:00.000Z"),
      fetcher: async (url) => {
        requestedUrls.push(url.href);
        return jsonResponse(responses.shift());
      },
    });

    const first = await adapter.listBillsChangedSince(
      new Date("2026-09-02T18:00:00.000Z"),
    );
    const second = await adapter.listBillsChangedSince(
      new Date("2026-09-02T18:00:00.000Z"),
      first.nextCursor ?? undefined,
    );
    const third = await adapter.listBillsChangedSince(
      new Date("2026-09-02T18:00:00.000Z"),
      second.nextCursor ?? undefined,
    );

    expect(first.items[0]?.externalId).toBe("2351249");
    expect(requestedUrls[1]).toBe(pageTwoUrl);
    expect(new URL(requestedUrls[0]!).searchParams.get("dataInicio")).toBe("2026-09-02");
    expect(new URL(requestedUrls[2]!).searchParams.get("dataInicio")).toBe("2026-09-03");
    expect(third.nextCursor).toBeNull();
  });

  it("filters a same-day page to the exact incremental interval", async () => {
    const before = {
      ...billListFixture.dados[0],
      id: 2351250,
      dataApresentacao: "2026-09-03T14:40",
    };
    const inside = {
      ...billListFixture.dados[0],
      id: 2351251,
      dataApresentacao: "2026-09-03T14:58",
    };
    const adapter = new CamaraAdapter({
      baseUrl: "https://camara.test/api/v2",
      now: () => new Date("2026-09-03T18:00:00.000Z"),
      fetcher: async () => jsonResponse({ dados: [before, inside], links: [] }),
    });

    const page = await adapter.listBillsChangedSince(
      new Date("2026-09-03T17:55:00.000Z"),
    );

    expect(page.items.map((item) => item.externalId)).toEqual(["2351251"]);
  });

  it("keeps mapping a batch when one structured proposal type is unrecognized", async () => {
    const base = {
      ...billListFixture.dados[0],
      dataApresentacao: "2026-09-03T14:58",
    };
    const adapter = new CamaraAdapter({
      baseUrl: "https://camara.test/api/v2",
      now: () => new Date("2026-09-03T18:00:00.000Z"),
      fetcher: async () => jsonResponse({
        dados: [
          { ...base, id: 2351251, siglaTipo: "ATA_PRE" },
          { ...base, id: 2351252, siglaTipo: "TIPO/INTERNO" },
        ],
        links: [],
      }),
    });

    const page = await adapter.listBillsChangedSince(new Date("2026-09-03T17:55:00.000Z"));

    expect(page.items.map(({ externalId, proposalType }) => ({ externalId, proposalType }))).toEqual([
      { externalId: "2351251", proposalType: "ATA_PRE" },
      { externalId: "2351252", proposalType: null },
    ]);
  });

  it("turns a malformed official payload into a bounded contract error", async () => {
    const adapter = new CamaraAdapter({
      baseUrl: "https://camara.test/api/v2",
      fetcher: async () => jsonResponse({ dados: { unexpected: true }, links: [] }),
    });

    const result = adapter.listActiveLawmakers();

    await expect(result).rejects.toMatchObject({
      name: "OfficialSourceError",
      retryable: false,
      status: null,
    });
    await expect(result).rejects.toBeInstanceOf(OfficialSourceError);
  });

  it("preserves a failed official HTTP status without parsing its body", async () => {
    const adapter = new CamaraAdapter({
      baseUrl: "https://camara.test/api/v2",
      fetcher: async () => jsonResponse({ dados: [], links: [] }),
    });
    const failingAdapter = new CamaraAdapter({
      baseUrl: "https://camara.test/api/v2",
      fetcher: async () => new Response("temporary failure", { status: 503 }),
    });

    await expect(failingAdapter.listActiveLawmakers()).rejects.toMatchObject({
      name: "OfficialSourceError",
      status: 503,
      retryable: true,
    });
    await expect(adapter.listActiveLawmakers()).resolves.toMatchObject({ items: [] });
  });

  it("does not advance beyond an explicit reconciliation boundary", async () => {
    const requestedUrls: URL[] = [];
    const adapter = new CamaraAdapter({
      baseUrl: "https://camara.test/api/v2",
      now: () => new Date("2026-09-03T18:00:00.000Z"),
      fetcher: async (url) => {
        requestedUrls.push(url);
        return jsonResponse({ dados: [], links: [] });
      },
    });

    const first = await adapter.listBillsChangedSince(
      new Date("2026-09-01T00:00:00.000Z"),
      undefined,
      new Date("2026-09-01T23:59:59.999Z"),
    );
    const second = await adapter.listBillsChangedSince(
      new Date("2026-09-01T00:00:00.000Z"),
      first.nextCursor ?? undefined,
      new Date("2026-09-01T23:59:59.999Z"),
    );

    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]?.searchParams.get("dataInicio")).toBe("2026-08-31");
    expect(requestedUrls[0]?.searchParams.get("dataFim")).toBe("2026-08-31");
    expect(requestedUrls[1]?.searchParams.get("dataInicio")).toBe("2026-09-01");
    expect(requestedUrls[1]?.searchParams.get("dataFim")).toBe("2026-09-01");
    expect(second.nextCursor).toBeNull();
  });
});
