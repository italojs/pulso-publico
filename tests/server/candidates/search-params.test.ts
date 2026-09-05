import { describe, expect, it } from "vitest";

import type { CandidateFilters } from "#/server/candidates/read-models";
import { parseCandidateFilterInput, toCandidateFilterInput } from "#/server/candidates/filter-contract";
import {
  buildCandidateHref,
  countCandidateFilters,
  parseCandidateSearchParams,
  type CandidateRawSearchParams,
} from "#/server/candidates/search-params";

function rawFromHref(href: string): CandidateRawSearchParams {
  const params = new URL(href, "https://app.test").searchParams;
  return Object.fromEntries(
    [...new Set(params.keys())].map((key) => [key, params.getAll(key)]),
  );
}

describe("candidate search params", () => {
  it("round-trips every standard and advanced filter canonically", () => {
    const filters: CandidateFilters = {
      query: "ana 1234",
      electionYears: [2026],
      offices: ["deputado_federal", "senador"],
      regions: ["ES", "SP"],
      parties: ["ABC", "XYZ"],
      rounds: [1, 2],
      statuses: ["APTO"],
      federations: ["Federação Brasil"],
      coalitions: ["Coligação Cidadã"],
      ageMin: 30,
      ageMax: 60,
      genders: ["FEMININO"],
      races: ["PARDA"],
      educations: ["SUPERIOR COMPLETO"],
      occupations: ["PROFESSORA"],
      declaredAssets: "yes",
      assetMinCents: 10_000_000n,
      assetMaxCents: 20_000_050n,
      assetCountMin: 1,
      assetCountMax: 5,
      assetCategories: ["Apartamento"],
      revenueMinCents: 0n,
      revenueMaxCents: 50_000_000n,
      expenseMinCents: 100n,
      expenseMaxCents: 40_000_000n,
      balanceMinCents: 0n,
      balanceMaxCents: 10_000_000n,
      fundingKinds: ["public", "private", "own"],
      hasPhoto: true,
      hasSocial: false,
      hasGovernmentPlan: true,
      hasCertificates: false,
      hasFinance: true,
      hasConfirmedLawmaker: true,
      lawmakerHouses: ["camara", "senado"],
      activeMandate: false,
      topics: ["Trabalho", "Saúde"],
      followedOnly: true,
      order: "votes_desc",
      page: 3,
      pageSize: 20,
    };

    const href = buildCandidateHref(filters, 3);

    expect(href).toContain("/candidatos?");
    expect(href).toContain("cargo=deputado_federal&cargo=senador");
    expect(href).toContain("patrimonioMin=100000");
    expect(href).toContain("despesaMin=1");
    expect(href).toContain("saldoMin=0");
    expect(parseCandidateSearchParams(rawFromHref(href))).toEqual(filters);
  });

  it("deduplicates and bounds repeated and free-text values", () => {
    const values = Array.from({ length: 24 }, (_, index) => `Partido ${index}`);
    const filters = parseCandidateSearchParams({
      partido: [values[0]!, values[0]!, ...values.slice(1)],
      situacao: [" APTO ", "APTO"],
      q: `  ${"x".repeat(250)}  `,
    });

    expect(filters.parties).toHaveLength(20);
    expect(filters.parties?.[0]).toBe("Partido 0");
    expect(filters.statuses).toEqual(["APTO"]);
    expect(filters.query).toHaveLength(200);
  });

  it("builds a canonical URL from duplicate typed values", () => {
    const href = buildCandidateHref({
      offices: ["senador", "senador"],
      parties: [" ABC ", "ABC", "XYZ"],
      topics: ["Trabalho", "Trabalho"],
    }, 1);

    const params = new URL(href, "https://app.test").searchParams;
    expect(params.getAll("cargo")).toEqual(["senador"]);
    expect(params.getAll("partido")).toEqual(["ABC", "XYZ"]);
    expect(params.getAll("tema")).toEqual(["Trabalho"]);
  });

  it("rejects malformed values and reversed ranges instead of changing their meaning", () => {
    const filters = parseCandidateSearchParams({
      ano: ["2025", "2026"],
      cargo: ["prefeito", "senador"],
      uf: ["ZZ", "BR"],
      turno: ["0", "1"],
      idadeMin: "61",
      idadeMax: "30",
      patrimonioMin: "1.001",
      patrimonioMax: "-1",
      receitaMin: "92233720368547758.08",
      comFoto: "talvez",
      ordem: "melhor",
      pagina: "0",
      porPagina: "51",
    });

    expect(filters).toEqual({
      electionYears: [2026],
      offices: ["senador"],
      regions: ["BR"],
      rounds: [1],
      page: 1,
      pageSize: 20,
    });
  });

  it("counts filter groups without counting pagination or ordering", () => {
    const filters = parseCandidateSearchParams({
      q: "ana",
      cargo: "senador",
      patrimonioMin: "0",
      patrimonioMax: "100",
      comFoto: "1",
      pagina: "4",
      ordem: "name",
    });

    expect(countCandidateFilters(filters)).toBe(4);
    expect(buildCandidateHref(filters, 1)).not.toContain("pagina=");
  });

  it("treats followed-only as true-or-absent while preserving false availability filters", () => {
    const parsed = parseCandidateSearchParams({ acompanhando: "0", comFoto: "0" });

    expect(parsed).not.toHaveProperty("followedOnly");
    expect(parsed.hasPhoto).toBe(false);
    expect(countCandidateFilters({ followedOnly: false, hasPhoto: false })).toBe(1);
    expect(buildCandidateHref({ followedOnly: false, hasPhoto: false }, 1)).toBe("/candidatos?comFoto=0");
  });

  it("round-trips the explicit all-Brazil state without counting it as a filter", () => {
    const parsed = parseCandidateSearchParams({ abrangencia: "brasil", pagina: "2" });

    expect(parsed).toEqual({ allBrazil: true, page: 2, pageSize: 20 });
    expect(buildCandidateHref(parsed, 2)).toBe("/candidatos?abrangencia=brasil&pagina=2");
    expect(countCandidateFilters(parsed)).toBe(0);
    expect(parseCandidateFilterInput(toCandidateFilterInput(parsed))).toEqual(parsed);
  });

  it("gives an explicit UF precedence over the all-Brazil state", () => {
    expect(parseCandidateSearchParams({ uf: "ES", abrangencia: "brasil" })).toEqual({
      regions: ["ES"],
      page: 1,
      pageSize: 20,
    });
    expect(buildCandidateHref({ regions: ["SP"], allBrazil: true }, 1)).toBe("/candidatos?uf=SP");
  });

  it("ignores unsupported coverage values", () => {
    expect(parseCandidateSearchParams({ abrangencia: ["mundo", "brasil"] })).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it.each([
    [{ ageMin: -1 }],
    [{ ageMax: 151 }],
    [{ ageMin: 61, ageMax: 30 }],
    [{ assetCountMin: -1 }],
    [{ assetCountMax: 1_000_001 }],
    [{ assetCountMin: 2, assetCountMax: 1 }],
    [{ assetMinCents: -1n }],
    [{ assetMaxCents: 9_223_372_036_854_775_808n }],
    [{ assetMinCents: 2n, assetMaxCents: 1n }],
    [{ revenueMinCents: 2n, revenueMaxCents: 1n }],
    [{ expenseMinCents: 2n, expenseMaxCents: 1n }],
    [{ balanceMinCents: 2n, balanceMaxCents: 1n }],
    [{ pageSize: 0 }],
    [{ pageSize: 51 }],
  ] as const)("rejects non-canonical programmatic filter bounds %#", (filters) => {
    expect(() => buildCandidateHref(filters, 1)).toThrow(RangeError);
  });

  it.each([0, 100_001, 1.5])("rejects invalid programmatic page %s", (page) => {
    expect(() => buildCandidateHref({}, page)).toThrow(RangeError);
  });

  it("round-trips the valid scalar boundaries without changing them", () => {
    const filters: CandidateFilters = {
      ageMin: 0,
      ageMax: 150,
      assetCountMin: 0,
      assetCountMax: 1_000_000,
      assetMinCents: 0n,
      assetMaxCents: 9_223_372_036_854_775_807n,
      revenueMinCents: 0n,
      revenueMaxCents: 9_223_372_036_854_775_807n,
      expenseMinCents: 0n,
      expenseMaxCents: 9_223_372_036_854_775_807n,
      balanceMinCents: 0n,
      balanceMaxCents: 9_223_372_036_854_775_807n,
      page: 100_000,
      pageSize: 50,
    };

    expect(parseCandidateSearchParams(rawFromHref(buildCandidateHref(filters, filters.page)))).toEqual(filters);
  });

  it.each([
    [{ electionYears: [2025] }],
    [{ electionYears: [2026.5] }],
    [{ rounds: [0] }],
    [{ rounds: [1.5] }],
    [{ regions: ["ZZ"] }],
    [{ offices: ["prefeito"] }],
    [{ fundingKinds: ["unknown"] }],
    [{ lawmakerHouses: ["congresso"] }],
    [{ declaredAssets: "maybe" }],
    [{ order: "best" }],
    [{ query: "x".repeat(201) }],
    [{ statuses: ["x".repeat(201)] }],
    [{ parties: [""] }],
    [{ topics: Array.from({ length: 21 }, (_, index) => `Tema ${index}`) }],
    [{ hasPhoto: "yes" }],
    [{ allBrazil: "yes" }],
  ] as Array<[Record<string, unknown>]>)("rejects invalid programmatic field contracts %#", (filters) => {
    expect(() => buildCandidateHref(filters as CandidateFilters, 1)).toThrow();
    expect(() => toCandidateFilterInput(filters as CandidateFilters)).toThrow();
  });

  it("canonicalizes duplicate repeated values before enforcing the twenty-value cap", () => {
    const parties = [...Array.from({ length: 20 }, (_, index) => ` Partido ${index} `), "Partido 0"];
    const filters: CandidateFilters = {
      electionYears: [2026, 2026],
      offices: ["senador", "senador"],
      regions: ["ES", "ES", "SP"],
      parties,
      rounds: [1, 1, 2],
      statuses: [" APTO ", "APTO"],
      fundingKinds: ["public", "public", "own"],
      lawmakerHouses: ["camara", "camara", "senado"],
    };

    const fromUrl = parseCandidateSearchParams(rawFromHref(buildCandidateHref(filters, 1)));
    const fromWire = parseCandidateFilterInput(toCandidateFilterInput(filters));

    const expected = {
      electionYears: [2026], offices: ["senador"], regions: ["ES", "SP"],
      parties: Array.from({ length: 20 }, (_, index) => `Partido ${index}`),
      rounds: [1, 2], statuses: ["APTO"], fundingKinds: ["public", "own"],
      lawmakerHouses: ["camara", "senado"],
    };
    expect(fromUrl).toMatchObject(expected);
    expect(fromWire).toMatchObject(expected);
  });
});
