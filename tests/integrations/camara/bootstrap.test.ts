import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  streamCamaraBillArchive,
  streamCamaraCatalogArchive,
} from "#/integrations/camara/bootstrap";

const fixtureUrl = new URL("../../fixtures/camara/proposicoes.csv", import.meta.url);

describe("streamCamaraBillArchive", () => {
  it("joins annual official authors and topics into the historical catalog", async () => {
    const proposals = [
      "id;uri;siglaTipo;numero;ano;codTipo;descricaoTipo;ementa;dataApresentacao;ultimoStatus_descricaoSituacao",
      "2210208;https://dadosabertos.camara.leg.br/api/v2/proposicoes/2210208;PL;10;2019;139;Projeto de Lei;Ementa oficial;2019-02-10;Apresentado",
    ].join("\n");
    const authors = [
      "idProposicao;uriProposicao;idDeputadoAutor;uriAutor;codTipoAutor;tipoAutor;nomeAutor;siglaPartidoAutor;uriPartidoAutor;siglaUFAutor;ordemAssinatura;proponente",
      "2210208;https://dadosabertos.camara.leg.br/api/v2/proposicoes/2210208;100;https://dadosabertos.camara.leg.br/api/v2/deputados/100;10000;Deputado;Ana Cidadã;ABC;;PE;1;1",
    ].join("\n");
    const topics = [
      "uriProposicao;siglaTipo;numero;ano;codTema;tema;relevancia",
      "https://dadosabertos.camara.leg.br/api/v2/proposicoes/2210208;PL;10;2019;58;Trabalho e Emprego;0",
    ].join("\n");
    const requested: string[] = [];
    const items = [];

    for await (const item of streamCamaraCatalogArchive(
      new Date("2019-01-01T02:00:00.000Z"),
      new Date("2020-01-01T02:59:59.999Z"),
      {
        archiveBaseUrl: "https://camara.test/arquivos/proposicoes/csv/",
        fetcher: async (url) => {
          requested.push(url.pathname);
          if (url.pathname.includes("proposicoesAutores")) return new Response(authors);
          if (url.pathname.includes("proposicoesTemas")) return new Response(topics);
          return new Response(proposals);
        },
        checkedAt: new Date("2026-09-03T18:00:00.000Z"),
      },
    )) items.push(item);

    expect(requested).toEqual(expect.arrayContaining([
      "/arquivos/proposicoes/csv/proposicoes-2019.csv",
      "/arquivos/proposicoesAutores/csv/proposicoesAutores-2019.csv",
      "/arquivos/proposicoesTemas/csv/proposicoesTemas-2019.csv",
    ]));
    expect(items[0]?.authors[0]).toMatchObject({ officialName: "Ana Cidadã", party: "ABC" });
    expect(items[0]?.topics[0]).toMatchObject({ code: "58", label: "Trabalho e Emprego" });
  });

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

  it("retries an annual archive when its response body is interrupted", async () => {
    const fixture = await readFile(fixtureUrl);
    let attempts = 0;
    const bills = [];

    for await (const bill of streamCamaraBillArchive(
      new Date("2023-09-03T03:00:00.000Z"),
      new Date("2023-09-04T02:59:59.000Z"),
      {
        fetcher: async () => {
          attempts += 1;
          if (attempts === 1) {
            return new Response(new ReadableStream({
              start(controller) {
                controller.error(new TypeError("socket interrupted"));
              },
            }));
          }
          return new Response(fixture);
        },
      },
    )) {
      bills.push(bill);
    }

    expect(attempts).toBe(2);
    expect(bills.map((bill) => bill.externalId)).toEqual(["1002", "1003"]);
  });
});
