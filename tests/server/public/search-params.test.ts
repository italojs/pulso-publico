import { describe, expect, it } from "vitest";

import { buildFeedHref, parseFeedSearchParams } from "#/server/public/search-params";

describe("feed search params", () => {
  it("accepts known scalar filters and trims text", () => {
    expect(parseFeedSearchParams({
      q: "  jornada  ",
      fonte: "camara",
      situacao: "Em análise",
      tema: "Trabalho",
      partido: "ABC",
      autor: "Ana",
      ordem: "presented",
      pagina: "3",
    })).toEqual({
      query: "jornada",
      source: "camara",
      status: "Em análise",
      topic: "Trabalho",
      party: "ABC",
      author: "Ana",
      order: "presented",
      page: 3,
      pageSize: 20,
    });
  });

  it("rejects unknown values and bounds page numbers", () => {
    expect(parseFeedSearchParams({ fonte: "outra", ordem: "popular", pagina: "-9" })).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it("uses the first value when a parameter is repeated", () => {
    expect(parseFeedSearchParams({ q: ["primeiro", "segundo"] }).query).toBe("primeiro");
  });

  it("builds a page URL preserving active filters", () => {
    expect(buildFeedHref({ query: "jornada", source: "senado", page: 1 }, 4)).toBe(
      "/?q=jornada&fonte=senado&pagina=4",
    );
  });
});
