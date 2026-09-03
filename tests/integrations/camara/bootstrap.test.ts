import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { streamCamaraBillArchive } from "#/integrations/camara/bootstrap";

const fixtureUrl = new URL("../../fixtures/camara/proposicoes.csv", import.meta.url);

describe("streamCamaraBillArchive", () => {
  it("streams UTF-8 CSV records inside the exact rolling interval", async () => {
    const fixture = await readFile(fixtureUrl);
    const bills = [];

    for await (const bill of streamCamaraBillArchive(
      new Date("2023-09-03T03:00:00.000Z"),
      new Date("2023-09-04T02:59:59.000Z"),
      {
        fetcher: async () => new Response(fixture),
        checkedAt: new Date("2026-09-03T18:00:00.000Z"),
      },
    )) {
      bills.push(bill);
    }

    expect(bills.map((bill) => bill.externalId)).toEqual(["1002", "1003"]);
    expect(bills[0]?.officialSummary).toBe("Promove educação; ciência e robótica.");
    expect(bills[1]?.currentHouse).toBe("senado");
  });

  it("requests every annual archive touched by a 36-month interval", async () => {
    const requestedYears: number[] = [];
    const header =
      "id;uri;siglaTipo;numero;ano;codTipo;descricaoTipo;ementa;dataApresentacao;ultimoStatus_descricaoSituacao\n";

    for await (const _bill of streamCamaraBillArchive(
      new Date("2023-09-03T03:00:00.000Z"),
      new Date("2026-09-03T18:00:00.000Z"),
      {
        fetcher: async (url) => {
          const year = Number(url.pathname.match(/proposicoes-(\d{4})\.csv$/)?.[1]);
          requestedYears.push(year);
          return new Response(header);
        },
      },
    )) {
      throw new Error("Header-only archives must not yield bills");
    }

    expect(requestedYears).toEqual([2023, 2024, 2025, 2026]);
  });
});
