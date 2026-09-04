import { describe, expect, it } from "vitest";

import processFixture from "../../fixtures/senado/processo.json" with { type: "json" };
import processesFixture from "../../fixtures/senado/processos.json" with { type: "json" };
import senatorsFixture from "../../fixtures/senado/senadores.json" with { type: "json" };
import votesFixture from "../../fixtures/senado/votacoes.json" with { type: "json" };
import { SenadoAdapter } from "#/integrations/senado/client";

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("SenadoAdapter", () => {
  it("uses the official recent-update filter for an incremental sync", async () => {
    const requestedUrls: URL[] = [];
    const adapter = new SenadoAdapter({
      baseUrl: "https://senado.test/dadosabertos",
      now: () => new Date("2026-09-03T18:00:00.000Z"),
      fetcher: async (url) => {
        requestedUrls.push(url);
        return jsonResponse(processesFixture);
      },
    });

    const page = await adapter.listBillsChangedSince(
      new Date("2026-09-03T17:55:00.000Z"),
    );

    expect(requestedUrls[0]?.pathname).toBe("/dadosabertos/processo");
    expect(requestedUrls[0]?.searchParams.get("numdias")).toBe("1");
    expect(page.items[0]?.externalId).toBe("8972241");
    expect(page.nextCursor).toBeNull();
  });

  it("bounds an initial history load to calendar-month windows", async () => {
    const requestedUrls: URL[] = [];
    const adapter = new SenadoAdapter({
      baseUrl: "https://senado.test/dadosabertos",
      now: () => new Date("2026-09-03T18:00:00.000Z"),
      fetcher: async (url) => {
        requestedUrls.push(url);
        return jsonResponse([]);
      },
    });

    const first = await adapter.listBillsChangedSince(
      new Date("2026-07-15T03:00:00.000Z"),
    );
    await adapter.listBillsChangedSince(
      new Date("2026-07-15T03:00:00.000Z"),
      first.nextCursor ?? undefined,
    );

    expect(requestedUrls[0]?.searchParams.get("dataInicioApresentacao")).toBe(
      "2026-07-15",
    );
    expect(requestedUrls[0]?.searchParams.get("dataFimApresentacao")).toBe(
      "2026-07-31",
    );
    expect(requestedUrls[1]?.searchParams.get("dataInicioApresentacao")).toBe(
      "2026-08-01",
    );
    expect(requestedUrls[1]?.searchParams.get("dataFimApresentacao")).toBe(
      "2026-08-31",
    );
  });

  it("filters recent reconciliation results by their official update timestamp", async () => {
    const requestedUrls: URL[] = [];
    const inside = {
      ...processesFixture[0],
      id: 8972242,
      codigoMateria: 172004,
      dataUltimaAtualizacao: "2026-09-02T08:00:00.000",
    };
    const outside = {
      ...processesFixture[0],
      id: 8972243,
      codigoMateria: 172005,
      dataUltimaAtualizacao: "2026-09-03T08:00:00.000",
    };
    const adapter = new SenadoAdapter({
      baseUrl: "https://senado.test/dadosabertos",
      now: () => new Date("2026-09-03T18:00:00.000Z"),
      fetcher: async (url) => {
        requestedUrls.push(url);
        return jsonResponse([inside, outside]);
      },
    });

    const page = await adapter.listBillsChangedSince(
      new Date("2026-09-02T00:00:00.000Z"),
      undefined,
      new Date("2026-09-02T23:59:59.999Z"),
    );

    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]?.searchParams.get("numdias")).toBe("2");
    expect(page.items.map((item) => item.externalId)).toEqual(["8972242"]);
    expect(page.nextCursor).toBeNull();
  });

  it("hydrates process relations and nominal votes from current JSON endpoints", async () => {
    const adapter = new SenadoAdapter({
      baseUrl: "https://senado.test/dadosabertos",
      now: () => new Date("2026-09-03T18:00:00.000Z"),
      fetcher: async (url) => {
        if (url.pathname.endsWith("/processo/8972241")) return jsonResponse(processFixture);
        if (url.pathname.endsWith("/votacao")) return jsonResponse(votesFixture);
        if (url.pathname.endsWith("/senador/lista/atual")) return jsonResponse(senatorsFixture);
        throw new Error(`Unexpected test URL: ${url.href}`);
      },
    });

    const [authors, topics, movements, voteEvents, lawmakers] = await Promise.all([
      adapter.listBillAuthors("8972241"),
      adapter.listBillTopics("8972241"),
      adapter.listBillMovements("8972241"),
      adapter.listBillVoteEvents("8972241"),
      adapter.listActiveLawmakers(),
    ]);
    const individualVotes = await adapter.listIndividualVotes("8972241:7041");

    expect(authors).toHaveLength(1);
    expect(topics).toHaveLength(1);
    expect(movements).toHaveLength(1);
    expect(voteEvents).toHaveLength(1);
    expect(individualVotes).toHaveLength(2);
    expect(lawmakers.items).toHaveLength(1);
  });

  it("deduplicates a movement repeated across Senate process branches", async () => {
    const repeatedProcess = {
      ...processFixture,
      autuacoes: [processFixture.autuacoes[0], processFixture.autuacoes[0]],
    };
    const adapter = new SenadoAdapter({
      baseUrl: "https://senado.test/dadosabertos",
      fetcher: async () => jsonResponse(repeatedProcess),
    });

    const movements = await adapter.listBillMovements("8972241");

    expect(movements).toHaveLength(1);
    expect(movements[0]?.sequence).toBe(0);
  });
});
