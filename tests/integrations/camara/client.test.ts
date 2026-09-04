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
