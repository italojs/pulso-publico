import { describe, expect, it } from "vitest";

import {
  buildFeedHref,
  countActiveFilters,
  parseFeedSearchParams,
} from "#/server/public/search-params";
import type { RawSearchParams } from "#/server/public/search-params";

describe("feed search params", () => {
  it("parses the complete public filter contract", () => {
    const filters = parseFeedSearchParams({
      q: "  jornada ", tipo: ["PEC", "PL", "PEC"], numero: "8",
      anoInicio: "2024", anoFim: "2026", fonte: ["camara", "senado"],
      origem: "camara", casaAtual: ["senado", "nao_informada"], fase: "committees",
      situacao: ["Em análise", "Pronta para pauta"], apresentadaInicio: "2024-01-01",
      atividadeFim: "2026-09-04", votacao: "with", tipoVotacao: ["nominal", "secret"],
      votosIndividuais: "available", resultado: "approved", casaVotacao: "camara",
      tema: ["Trabalho", "Saúde"], autor: "Ana", partido: "ABC", uf: "SP",
      acompanhando: "1", ordem: "most_votes", pagina: "3",
    });

    expect(filters).toEqual({
      query: "jornada",
      proposalTypes: ["PEC", "PL"],
      proposalNumber: 8,
      yearFrom: 2024,
      yearTo: 2026,
      sources: ["camara", "senado"],
      originHouses: ["camara"],
      currentHouses: ["senado", "nao_informada"],
      stages: ["committees"],
      statuses: ["Em análise", "Pronta para pauta"],
      presentedStart: "2024-01-01",
      activityEnd: "2026-09-04",
      votePresence: "with",
      voteKinds: ["nominal", "secret"],
      individualVoteAvailability: "available",
      voteResults: ["approved"],
      voteHouses: ["camara"],
      topics: ["Trabalho", "Saúde"],
      authors: ["Ana"],
      parties: ["ABC"],
      regions: ["SP"],
      followedOnly: true,
      order: "most_votes",
      source: "camara",
      status: "Em análise",
      topic: "Trabalho",
      party: "ABC",
      author: "Ana",
      proposalType: "PEC",
      page: 3,
      pageSize: 20,
    });
  });

  it("round-trips every public filter in repeated URL parameters", () => {
    const filters = parseFeedSearchParams({
      q: "jornada", tipo: ["PEC", "PL"], numero: "8", anoInicio: "2024", anoFim: "2026",
      fonte: ["camara", "senado"], origem: ["camara"], casaAtual: ["senado", "nao_informada"],
      fase: ["committees"], situacao: ["Em análise"], apresentadaInicio: "2024-01-01",
      apresentadaFim: "2026-01-01", atividadeInicio: "2024-01-02", atividadeFim: "2026-09-04",
      votacao: "with", tipoVotacao: ["nominal"], votosIndividuais: "available",
      resultado: ["approved"], casaVotacao: ["camara"], tema: ["Trabalho", "Saúde"],
      autor: "Ana", partido: "ABC", uf: ["SP"], acompanhando: "1", ordem: "most_votes",
    });

    const href = buildFeedHref(filters, 4);
    expect(href).toContain("tipo=PEC&tipo=PL");
    expect(href).toContain("fonte=camara&fonte=senado");
    expect(href).toContain("casaAtual=senado&casaAtual=nao_informada");
    expect(href).toContain("pagina=4");
    expect(href).not.toContain("pageSize");
    expect(href).not.toContain("followedBillKeys");

    const search = new URL(href, "https://example.test").searchParams;
    const shareableKeys = [
      "q", "tipo", "numero", "anoInicio", "anoFim", "fonte", "origem", "casaAtual", "fase",
      "situacao", "apresentadaInicio", "apresentadaFim", "atividadeInicio", "atividadeFim", "votacao",
      "tipoVotacao", "votosIndividuais", "resultado", "casaVotacao", "tema", "autor", "partido", "uf",
      "acompanhando", "ordem", "pagina",
    ];
    const roundTripParams = Object.fromEntries(
      shareableKeys.map((key) => [key, search.getAll(key)]),
    ) as RawSearchParams;
    const roundTrip = parseFeedSearchParams(roundTripParams);
    const withoutPaging = ({ page: _page, pageSize: _pageSize, ...rest }: typeof filters) => rest;
    expect(roundTrip).toEqual({ ...withoutPaging(filters), page: 4, pageSize: 20 });
  });

  it("rejects unknown enums, invalid dates, and reversed intervals", () => {
    expect(parseFeedSearchParams({
      fonte: ["outra", "camara"], fase: ["unknown", "committees"],
      votacao: "maybe", tipoVotacao: ["nominal", "other"], resultado: ["approved", "wat"],
      casaAtual: ["senado", "wat"], uf: ["SP", "ZZ"],
      apresentadaInicio: "2026-02-31", apresentadaFim: "2025-01-01",
      anoInicio: "2026", anoFim: "2024", numero: "0",
    })).toMatchObject({
      sources: ["camara"], stages: ["committees"], voteKinds: ["nominal"],
      voteResults: ["approved"], currentHouses: ["senado"], regions: ["SP"], page: 1,
    });
    expect(parseFeedSearchParams({ apresentadaInicio: "2026-02-31", apresentadaFim: "2025-01-01" }))
      .not.toHaveProperty("presentedStart");
    expect(parseFeedSearchParams({ anoInicio: "2026", anoFim: "2024" }))
      .not.toHaveProperty("yearFrom");
  });

  it("keeps legacy scalar consumers in sync with the first selected value", () => {
    const filters = parseFeedSearchParams({
      fonte: ["senado", "camara"], situacao: ["Em análise", "Pronta para pauta"],
      tema: ["Trabalho", "Saúde"], partido: ["ABC", "XYZ"], autor: ["Ana", "Bia"],
      ordem: "presented",
    });

    expect(filters).toMatchObject({
      sources: ["senado", "camara"], source: "senado",
      statuses: ["Em análise", "Pronta para pauta"], status: "Em análise",
      topics: ["Trabalho", "Saúde"], topic: "Trabalho",
      parties: ["ABC", "XYZ"], party: "ABC",
      authors: ["Ana", "Bia"], author: "Ana",
      order: "presented_desc",
    });
    expect(buildFeedHref(filters, 1)).toContain("ordem=presented_desc");
    expect(buildFeedHref({ source: "senado", status: "Em análise", topic: "Trabalho", party: "ABC", author: "Ana", proposalType: "PLX", order: "presented" }, 1))
      .toContain("fonte=senado");
    expect(buildFeedHref({ proposalType: "PLX" }, 1)).toContain("tipo=PLX");
  });

  it("accepts new proposal type tokens, non-nominal votes, and the region sentinel", () => {
    const filters = parseFeedSearchParams({
      tipo: ["PLX", "plx", "SBT-A", "EMC-A", "SBE-A", "ATA_PRE", "R.C", "R.S", "not a type", "TIPO/INTERNO"], tipoVotacao: ["non_nominal", "secret"],
      uf: ["nao_informada", "SP", "ZZ"],
    });
    expect(filters.proposalTypes).toEqual(["PLX", "SBT-A", "EMC-A", "SBE-A", "ATA_PRE", "R.C", "R.S"]);
    expect(filters.voteKinds).toEqual(["non_nominal", "secret"]);
    expect(filters.regions).toEqual(["nao_informada", "SP"]);
    expect(buildFeedHref(filters, 1)).toContain("tipo=PLX");
    expect(buildFeedHref(filters, 1)).toContain("tipo=SBT-A&tipo=EMC-A&tipo=SBE-A");
    expect(buildFeedHref(filters, 1)).toContain("tipo=ATA_PRE&tipo=R.C&tipo=R.S");
    expect(buildFeedHref(filters, 1)).not.toContain("TIPO%2FINTERNO");
    expect(buildFeedHref(filters, 1)).toContain("tipoVotacao=non_nominal");
    expect(buildFeedHref(filters, 1)).toContain("uf=nao_informada&uf=SP");
  });

  it("caps repeated groups at twenty unique values and truncates text", () => {
    const values = [
      "PEC", "PL", "PLP", "MPV", "PDL", "PRC", "PLV", "REQ", "RIC", "PFC", "PDC",
      "DLG", "MSC", "OFC", "SUG", "INC", "EMR", "RQS", "RCP", "TVR", "AVULSO", "PEC",
    ];
    const result = parseFeedSearchParams({ tipo: values, tema: values, q: "x".repeat(250) });
    expect(result.proposalTypes).toHaveLength(20);
    expect(result.topics).toHaveLength(20);
    expect(result.query).toHaveLength(200);
  });

  it("counts active filter groups and resets pagination when building a fresh URL", () => {
    const filters = parseFeedSearchParams({ q: "jornada", fonte: "camara", tema: "Trabalho", pagina: "3" });
    expect(countActiveFilters(filters)).toBe(3);
    expect(buildFeedHref(filters, 1)).not.toContain("pagina=");
  });

  it.each(["24h", "7d", "30d"] as const)("round-trips the canonical %s recent-activity preset", (recentActivity) => {
    const filters = parseFeedSearchParams({
      atividadeRecente: recentActivity,
      atividadeInicio: "2026-01-01",
      atividadeFim: "2026-02-01",
      fonte: "camara",
      pagina: "4",
    });

    expect(filters).toMatchObject({ recentActivity, sources: ["camara"], page: 4 });
    expect(filters).not.toHaveProperty("activityStart");
    expect(filters).not.toHaveProperty("activityEnd");
    expect(countActiveFilters(filters)).toBe(2);

    const href = buildFeedHref(filters, 1);
    expect(href).toContain(`atividadeRecente=${recentActivity}`);
    expect(href).not.toContain("atividadeInicio");
    expect(href).not.toContain("atividadeFim");
    expect(href).not.toContain("pagina=");
  });

  it("ignores an unknown recent-activity preset", () => {
    expect(parseFeedSearchParams({ atividadeRecente: "365d" })).not.toHaveProperty("recentActivity");
  });
});
