// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CandidateFilterOptions,
  CandidateFilters,
  PublicCandidateCard,
  PublicCandidatePage,
} from "#/server/candidates/read-models";
import { CandidateCard } from "#/ui/candidate-card";
import { CandidateFilterChips } from "#/ui/candidate-filter-chips";
import { CandidateFilters as CandidateFiltersPanel } from "#/ui/candidate-filters";
import { CandidatePagination } from "#/ui/candidate-pagination";
import { CandidateResults } from "#/ui/candidate-results";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation.js", () => ({ useRouter: () => ({ push: routerPush }) }));

const options = {
  snapshots: [{ electionYear: 2026, extractedAt: "2026-08-20T12:00:00.000Z" }],
  electionYears: [2026],
  offices: [
    { value: "deputado_federal", label: "Deputado federal" },
    { value: "senador", label: "Senador" },
  ],
  regions: ["ES", "SP", "BR"],
  parties: ["ABC", "XYZ"],
  rounds: [1, 2],
  statuses: ["APTO", "INAPTO"],
  federations: ["Federação Brasil"],
  coalitions: ["Coligação Cidadã"],
  genders: ["FEMININO", "MASCULINO"],
  races: ["BRANCA", "PARDA"],
  educations: ["SUPERIOR COMPLETO"],
  occupations: ["PROFESSORA", "ADVOGADO"],
  assetCategories: ["Apartamento", "Veículo"],
  fundingKinds: [
    { value: "public", label: "Recursos públicos" },
    { value: "private", label: "Recursos privados" },
    { value: "own", label: "Recursos próprios" },
  ],
  lawmakerHouses: [
    { value: "camara", label: "Câmara dos Deputados" },
    { value: "senado", label: "Senado Federal" },
  ],
  topics: ["Educação", "Trabalho"],
} satisfies CandidateFilterOptions;

const candidate = {
  electionYear: 2026,
  externalId: "260001234567",
  fullName: "ANA MARIA CIDADÃ",
  ballotName: "ANA CIDADÃ",
  socialName: null,
  number: 1234,
  office: "deputado_federal",
  round: 1,
  region: "ES",
  electoralUnit: "ESPÍRITO SANTO",
  status: "APTO",
  statusDetail: "DEFERIDO",
  partyAcronym: "ABC",
  partyNumber: 12,
  partyName: "Aliança Brasileira Cidadã",
  federation: "Federação Brasil",
  coalition: null,
  photoUrl: "/api/candidates/media/candidate/2026/260001234567/photo",
  sourceArchiveUrl: "https://cdn.tse.jus.br/consulta_cand_2026.zip",
  sourceExtractedAt: "2026-08-20T12:00:00.000Z",
  checkedAt: "2026-09-04T12:00:00.000Z",
  assetTotalCents: "0",
  assetCount: 1,
  finance: {
    revenueCents: "0",
    expenseCents: "150050",
    balanceCents: "0",
    revenueByCategory: {},
    expenseByCategory: {},
    sourceArchiveUrl: "https://cdn.tse.jus.br/prestacao_2026.zip",
    sourceExtractedAt: "2026-08-21T12:00:00.000Z",
    checkedAt: "2026-09-04T12:00:00.000Z",
  },
  hasPhoto: true,
  hasSocial: true,
  hasGovernmentPlan: true,
  hasCertificates: false,
  hasFinance: true,
  hasConfirmedLawmaker: true,
  projectCount: 3,
  voteCount: 17,
} satisfies PublicCandidateCard;

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  routerPush.mockReset();
});

function renderFilters(
  filters: CandidateFilters = {},
  authenticated = true,
  regionOrigin: "ip" | "url" | undefined = undefined,
  customOptions: CandidateFilterOptions = options,
  comparison: { year: number; ids: string[] } | undefined = undefined,
) {
  return render(
    <CandidateFiltersPanel
      authenticated={authenticated}
      filters={filters}
      options={customOptions}
      regionOrigin={regionOrigin}
      comparison={comparison}
    />,
  );
}

function openAdvanced() {
  fireEvent.click(screen.getByRole("button", { name: /filtros avançados/i }));
  return screen.getByRole("dialog", { name: "Filtros avançados de candidatos" });
}

describe("candidate catalog", () => {
  it("renders the standard filters and preserves advanced values on quick submit", () => {
    renderFilters({
      allBrazil: true,
      query: "ana",
      offices: ["deputado_federal", "senador"],
      regions: undefined,
      parties: ["ABC", "XYZ"],
      statuses: ["APTO"],
      topics: ["Educação"],
      ageMin: 30,
      order: "votes_desc",
      page: 8,
    });

    const form = screen.getByRole("form", { name: "Filtros padrão de candidatos" });
    expect(within(form).getByRole("searchbox", { name: "Buscar candidatos" })).toBeVisible();
    expect(within(form).getByRole("combobox", { name: "Cargo" })).toBeVisible();
    expect(within(form).getByRole("combobox", { name: "UF" })).toBeVisible();
    expect(within(form).getByRole("combobox", { name: "Partido" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Filtros avançados · 6 ativos/ })).toBeVisible();

    fireEvent.change(within(form).getByRole("searchbox", { name: "Buscar candidatos" }), { target: { value: "ana cidadã" } });
    fireEvent.submit(form);

    const href = String(routerPush.mock.calls[0]?.[0]);
    const params = new URL(href, "https://local.invalid").searchParams;
    expect(params.get("q")).toBe("ana cidadã");
    expect(params.getAll("cargo")).toEqual(["deputado_federal", "senador"]);
    expect(params.getAll("partido")).toEqual(["ABC", "XYZ"]);
    expect(params.get("situacao")).toBe("APTO");
    expect(params.get("tema")).toBe("Educação");
    expect(params.get("idadeMin")).toBe("30");
    expect(params.get("ordem")).toBe("votes_desc");
    expect(params.get("abrangencia")).toBe("brasil");
    expect(params.has("pagina")).toBe(false);
  });

  it("keeps every deduplicated official UF and party available in sorted standard selects", () => {
    const regions = [
      "TO", "SE", "SP", "SC", "RR", "RO", "RS", "RN", "RJ", "PI", "PE", "PR", "PB", "PA",
      "MG", "MS", "MT", "MA", "GO", "ES", "DF", "CE", "BA", "AM", "AP", "AL", "AC", "BR", "SP",
    ];
    const parties = [...Array.from({ length: 25 }, (_, index) => `P${String(25 - index).padStart(2, "0")}`), "P25"];
    renderFilters({}, true, undefined, { ...options, regions, parties });
    const form = screen.getByRole("form", { name: "Filtros padrão de candidatos" });
    const region = within(form).getByRole("combobox", { name: "UF" }) as HTMLSelectElement;
    const party = within(form).getByRole("combobox", { name: "Partido" }) as HTMLSelectElement;

    expect([...region.options].map((option) => option.value)).toEqual([
      "", "AC", "AL", "AM", "AP", "BA", "BR", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
      "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
    ]);
    expect([...party.options].map((option) => option.value)).toEqual([
      "", "P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12",
      "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20", "P21", "P22", "P23", "P24", "P25",
    ]);

    fireEvent.change(region, { target: { value: "TO" } });
    fireEvent.change(party, { target: { value: "P25" } });
    fireEvent.submit(form);
    const params = new URL(String(routerPush.mock.calls[0]?.[0]), "https://local.invalid").searchParams;
    expect(params.get("uf")).toBe("TO");
    expect(params.get("partido")).toBe("P25");
  });

  it("preserves catalog comparison IDs through standard and advanced filters", () => {
    const comparison = { year: 2026, ids: ["4040", "1010"] };
    renderFilters({ regions: ["ES"] }, true, undefined, options, comparison);

    const quickForm = screen.getByRole("form", { name: "Filtros padrão de candidatos" });
    fireEvent.submit(quickForm);
    let params = new URL(String(routerPush.mock.calls.at(-1)?.[0]), "https://local.invalid").searchParams;
    expect(params.get("compararAno")).toBe("2026");
    expect(params.getAll("compararId")).toEqual(["4040", "1010"]);

    const advanced = openAdvanced();
    const advancedForm = advanced.querySelector("form")!;
    params = new URLSearchParams(new FormData(advancedForm) as never);
    expect(params.get("compararAno")).toBe("2026");
    expect(params.getAll("compararId")).toEqual(["4040", "1010"]);
  });

  it("keeps the Brazil opt-out across unrelated changes and clears it for an explicit UF", () => {
    renderFilters({ allBrazil: true, parties: ["ABC"] });
    const form = screen.getByRole("form", { name: "Filtros padrão de candidatos" });

    fireEvent.change(within(form).getByRole("combobox", { name: "Partido" }), { target: { value: "XYZ" } });
    fireEvent.submit(form);
    expect(String(routerPush.mock.calls.at(-1)?.[0])).toContain("abrangencia=brasil");

    fireEvent.change(within(form).getByRole("combobox", { name: "UF" }), { target: { value: "ES" } });
    fireEvent.submit(form);
    const href = String(routerPush.mock.calls.at(-1)?.[0]);
    expect(href).toContain("uf=ES");
    expect(href).not.toContain("abrangencia=brasil");
  });

  it("turns removing the final explicit UF into a canonical all-Brazil opt-out", () => {
    renderFilters({ regions: ["ES"] });
    const dialog = openAdvanced();
    fireEvent.click(within(within(dialog).getByRole("group", { name: "UF ou circunscrição" })).getByRole("checkbox", { name: "ES" }));
    fireEvent.submit(within(dialog).getByRole("button", { name: /aplicar filtros/i }).closest("form")!);

    expect(routerPush).toHaveBeenCalledWith("/candidatos?abrangencia=brasil");
  });

  it("marks an inferred UF and builds a persistent all-Brazil opt-out", () => {
    renderFilters({ regions: ["ES"], topics: ["Trabalho"] }, false, "ip");

    expect(screen.getByText("UF estimada: ES")).toBeVisible();
    const showBrazil = screen.getByRole("link", { name: "Mostrar Brasil inteiro" });
    const href = showBrazil.getAttribute("href") ?? "";
    expect(href).toContain("abrangencia=brasil");
    expect(href).toContain("tema=Trabalho");
    expect(href).not.toContain("uf=ES");
  });

  it("resynchronizes controlled standard and advanced values after navigation", () => {
    const view = renderFilters({ query: "ana", regions: ["ES"], parties: ["ABC"], ageMin: 20 });
    view.rerender(
      <CandidateFiltersPanel
        authenticated
        filters={{ query: "bruno", regions: ["SP"], parties: ["XYZ"], ageMin: 40, topics: ["Trabalho"] }}
        options={options}
        regionOrigin="url"
      />,
    );

    const form = screen.getByRole("form", { name: "Filtros padrão de candidatos" });
    expect(within(form).getByRole("searchbox", { name: "Buscar candidatos" })).toHaveValue("bruno");
    expect(within(form).getByRole("combobox", { name: "UF" })).toHaveValue("SP");
    expect(within(form).getByRole("combobox", { name: "Partido" })).toHaveValue("XYZ");
    const dialog = openAdvanced();
    expect(within(dialog).getByLabelText("Idade mínima")).toHaveValue(40);
    expect(within(dialog).getByRole("checkbox", { name: "Trabalho" })).toBeChecked();
  });

  it("keeps an unsubmitted draft when equivalent filter props receive a new identity", () => {
    const view = renderFilters({ allBrazil: true });
    const form = screen.getByRole("form", { name: "Filtros padrão de candidatos" });

    fireEvent.change(within(form).getByRole("searchbox", { name: "Buscar candidatos" }), {
      target: { value: "HADDAD" },
    });
    fireEvent.change(within(form).getByRole("combobox", { name: "Cargo" }), {
      target: { value: "deputado_federal" },
    });
    fireEvent.change(within(form).getByRole("combobox", { name: "Partido" }), {
      target: { value: "ABC" },
    });

    view.rerender(
      <CandidateFiltersPanel
        authenticated
        filters={{ allBrazil: true }}
        options={options}
      />,
    );

    expect(within(form).getByRole("searchbox", { name: "Buscar candidatos" })).toHaveValue("HADDAD");
    expect(within(form).getByRole("combobox", { name: "Cargo" })).toHaveValue("deputado_federal");
    expect(within(form).getByRole("combobox", { name: "Partido" })).toHaveValue("ABC");

    fireEvent.submit(form);
    expect(routerPush).toHaveBeenCalledWith(
      "/candidatos?abrangencia=brasil&q=HADDAD&cargo=deputado_federal&partido=ABC",
    );
  });

  it("keeps standard controls named so native GET submission applies their current values", () => {
    renderFilters({ allBrazil: true });
    const form = screen.getByRole("form", { name: "Filtros padrão de candidatos" });

    expect(within(form).getByRole("searchbox", { name: "Buscar candidatos" })).toHaveAttribute("name", "q");
    expect(within(form).getByRole("combobox", { name: "Cargo" })).toHaveAttribute("name", "cargo");
    expect(within(form).getByRole("combobox", { name: "UF" })).toHaveAttribute("name", "uf");
    expect(within(form).getByRole("combobox", { name: "Partido" })).toHaveAttribute("name", "partido");
  });

  it("exposes every supported advanced group with explicit accessible labels", () => {
    renderFilters();
    const dialog = openAdvanced();

    for (const name of [
      "Eleição", "Organização política", "Perfil informado ao TSE", "Patrimônio", "Campanha",
      "Disponibilidade", "Experiência confirmada", "Acompanhamento", "Ordenação",
    ]) {
      expect(within(dialog).getByRole("region", { name })).toBeVisible();
    }
    for (const name of [
      "Ano da eleição", "Turno", "Cargo", "UF ou circunscrição", "Situação da candidatura",
      "Partido", "Federação", "Coligação", "Gênero", "Raça ou cor", "Escolaridade", "Ocupação",
      "Declarou bens", "Categorias de bens", "Origem predominante dos recursos", "Disponibilidade dos dados",
      "Casa legislativa", "Temas de atuação", "Candidatos acompanhados",
    ]) {
      expect(within(dialog).getByRole("group", { name })).toBeInstanceOf(HTMLFieldSetElement);
    }
    for (const name of [
      "Idade mínima", "Idade máxima", "Patrimônio mínimo", "Patrimônio máximo", "Quantidade mínima de bens",
      "Quantidade máxima de bens", "Receita mínima", "Receita máxima", "Despesa mínima", "Despesa máxima",
      "Saldo mínimo", "Saldo máximo", "Mandato parlamentar",
    ]) {
      expect(within(dialog).getByLabelText(name)).toBeVisible();
    }
    expect(within(dialog).getByRole("combobox", { name: "Ordenar por" })).toHaveTextContent(
      "NomeNúmeroAtualizaçãoPatrimônioReceitaDespesaProjetos associadosVotações registradas",
    );
  });

  it("requires login for followed-only and preserves the complete intended return URL", () => {
    renderFilters({ allBrazil: true, parties: ["ABC"], topics: ["Educação"], order: "votes_desc" }, false);
    const dialog = openAdvanced();

    expect(within(dialog).getByRole("checkbox", { name: "Somente candidatos seguidos" })).toBeDisabled();
    const login = within(dialog).getByRole("link", { name: "Entrar para usar este filtro" });
    const next = new URL(login.getAttribute("href")!, "https://local.invalid").searchParams.get("next")!;
    const intended = new URL(next, "https://local.invalid").searchParams;
    expect(intended.get("abrangencia")).toBe("brasil");
    expect(intended.get("partido")).toBe("ABC");
    expect(intended.get("tema")).toBe("Educação");
    expect(intended.get("ordem")).toBe("votes_desc");
    expect(intended.get("acompanhando")).toBe("1");
  });

  it("keeps an anonymous login return safe while the edited draft is invalid", () => {
    renderFilters({ allBrazil: true, parties: ["ABC"] }, false);
    const dialog = openAdvanced();
    const countMaximum = within(dialog).getByLabelText("Quantidade máxima de bens");

    fireEvent.change(countMaximum, { target: { value: "1000001" } });

    expect(countMaximum).toHaveAttribute("aria-invalid", "true");
    const errorId = countMaximum.getAttribute("aria-errormessage");
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveRole("alert");
    expect(document.getElementById(errorId!)).toHaveTextContent("Informe quantidades de bens entre 0 e 1.000.000.");
    expect(within(dialog).getByRole("button", { name: "Aplicar filtros" })).toBeDisabled();

    const next = new URL(
      within(dialog).getByRole("link", { name: "Entrar para usar este filtro" }).getAttribute("href")!,
      "https://local.invalid",
    ).searchParams.get("next")!;
    const intended = new URL(next, "https://local.invalid").searchParams;
    expect(intended.get("abrangencia")).toBe("brasil");
    expect(intended.get("partido")).toBe("ABC");
    expect(intended.get("acompanhando")).toBe("1");
    expect(intended.has("quantidadeBensMax")).toBe(false);
  });

  it("exposes and enforces every numeric and monetary filter bound before preview or submit", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderFilters();
    const dialog = openAdvanced();
    const ageMinimum = within(dialog).getByLabelText("Idade mínima");
    const ageMaximum = within(dialog).getByLabelText("Idade máxima");
    const countMinimum = within(dialog).getByLabelText("Quantidade mínima de bens");
    const countMaximum = within(dialog).getByLabelText("Quantidade máxima de bens");

    expect(ageMinimum).toHaveAttribute("min", "0");
    expect(ageMinimum).toHaveAttribute("max", "150");
    expect(ageMaximum).toHaveAttribute("min", "0");
    expect(ageMaximum).toHaveAttribute("max", "150");
    expect(countMinimum).toHaveAttribute("min", "0");
    expect(countMinimum).toHaveAttribute("max", "1000000");
    expect(countMaximum).toHaveAttribute("min", "0");
    expect(countMaximum).toHaveAttribute("max", "1000000");

    ageMinimum.focus();
    fireEvent.change(ageMinimum, { target: { value: "151" } });
    fireEvent.change(countMaximum, { target: { value: "1000001" } });
    fireEvent.change(within(dialog).getByLabelText("Patrimônio máximo"), { target: { value: "92233720368547758,08" } });

    expect(ageMinimum).toHaveFocus();
    expect(ageMinimum).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByText("Informe idades entre 0 e 150 anos.")).toHaveRole("alert");
    expect(within(dialog).getByText("Informe quantidades de bens entre 0 e 1.000.000.")).toHaveRole("alert");
    expect(within(dialog).getByText("Informe valores de patrimônio em reais, usando apenas números e centavos.")).toHaveRole("alert");
    const apply = within(dialog).getByRole("button", { name: "Aplicar filtros" });
    expect(apply).toBeDisabled();
    expect(() => fireEvent.submit(apply.closest("form")!)).not.toThrow();
    expect(routerPush).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("server-renders canonical names for advanced GET fallback controls", () => {
    renderFilters({
      allBrazil: true,
      query: "ana",
      ageMin: 30,
      assetMinCents: 100n,
      assetCountMin: 1,
      revenueMinCents: 200n,
      expenseMinCents: 300n,
      balanceMinCents: 0n,
      hasPhoto: false,
      activeMandate: true,
      order: "votes_desc",
    });
    const form = openAdvanced().querySelector("form")!;
    const data = new FormData(form);

    expect(data.get("q")).toBe("ana");
    expect(data.get("abrangencia")).toBe("brasil");
    expect(data.get("idadeMin")).toBe("30");
    expect(data.get("patrimonioMin")).toBe("1");
    expect(data.get("quantidadeBensMin")).toBe("1");
    expect(data.get("receitaMin")).toBe("2");
    expect(data.get("despesaMin")).toBe("3");
    expect(data.get("saldoMin")).toBe("0");
    expect(data.get("comFoto")).toBe("0");
    expect(data.get("mandatoAtivo")).toBe("1");
    expect(data.get("ordem")).toBe("votes_desc");
    expect(data.has("pagina")).toBe(false);
  });

  it("normalizes localized money to exact dot-decimal values in native GET and router URLs", () => {
    renderFilters({ assetMinCents: 9_223_372_036_854_775_807n, topics: ["Educação"] });
    const quickForm = screen.getByRole("form", { name: "Filtros padrão de candidatos" });
    expect(new FormData(quickForm).get("patrimonioMin")).toBe("92233720368547758.07");

    const dialog = openAdvanced();
    const money = within(dialog).getByLabelText("Patrimônio mínimo");
    expect(money).toHaveValue("92233720368547758,07");
    fireEvent.change(money, { target: { value: "1234,56" } });

    const form = money.closest("form")!;
    expect(new FormData(form).getAll("patrimonioMin")).toEqual(["1234.56"]);
    fireEvent.submit(form);
    const href = new URL(String(routerPush.mock.calls.at(-1)?.[0]), "https://local.invalid");
    expect(href.searchParams.get("patrimonioMin")).toBe("1234.56");
    expect(href.searchParams.get("tema")).toBe("Educação");
  });

  it("debounces an exact wire-safe preview and strips pagination", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ total: 42 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderFilters({
      allBrazil: true,
      query: "ana",
      electionYears: [2026],
      offices: ["deputado_federal"],
      parties: ["ABC"],
      rounds: [1],
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
      assetMinCents: 0n,
      assetMaxCents: 100_050n,
      assetCountMin: 0,
      assetCountMax: 5,
      assetCategories: ["Apartamento"],
      revenueMinCents: 0n,
      revenueMaxCents: 200_000n,
      expenseMinCents: 100n,
      expenseMaxCents: 150_000n,
      balanceMinCents: 0n,
      balanceMaxCents: 50_000n,
      fundingKinds: ["public"],
      hasPhoto: true,
      hasSocial: false,
      hasGovernmentPlan: true,
      hasCertificates: false,
      hasFinance: true,
      hasConfirmedLawmaker: true,
      lawmakerHouses: ["camara"],
      activeMandate: false,
      topics: ["Educação"],
      order: "votes_desc",
      page: 9,
      pageSize: 50,
    });
    openAdvanced();

    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({ filters: {
      allBrazil: true,
      query: "ana",
      electionYears: [2026],
      offices: ["deputado_federal"],
      parties: ["ABC"],
      rounds: [1],
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
      assetMin: "0",
      assetMax: "1000.5",
      assetCountMin: 0,
      assetCountMax: 5,
      assetCategories: ["Apartamento"],
      revenueMin: "0",
      revenueMax: "2000",
      expenseMin: "1",
      expenseMax: "1500",
      balanceMin: "0",
      balanceMax: "500",
      fundingKinds: ["public"],
      hasPhoto: true,
      hasSocial: false,
      hasGovernmentPlan: true,
      hasCertificates: false,
      hasFinance: true,
      hasConfirmedLawmaker: true,
      lawmakerHouses: ["camara"],
      activeMandate: false,
      topics: ["Educação"],
      order: "votes_desc",
    } });
    expect(screen.getByRole("status")).toHaveTextContent("42 candidaturas encontradas");
  });

  it("aborts stale preview requests and retains the last valid count after a transient failure", async () => {
    vi.useFakeTimers();
    let request = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      request += 1;
      if (request === 1) return Promise.resolve(new Response(JSON.stringify({ total: 18 }), { status: 200 }));
      if (request === 2) return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
      return Promise.reject(new Error("temporarily unavailable"));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderFilters();
    const dialog = openAdvanced();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("18 candidaturas encontradas");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "APTO" }));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    const secondSignal = (fetchMock.mock.calls[1]?.[1] as RequestInit).signal as AbortSignal;
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "INAPTO" }));
    expect(secondSignal.aborted).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível atualizar a contagem. Última contagem: 18 candidaturas.");
    expect(within(dialog).getByRole("button", { name: "Ver 18 candidaturas" })).toBeEnabled();
  });

  it("rejects reversed ranges before preview and submission", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderFilters({
      ageMax: 30,
      assetMaxCents: 100n,
      assetCountMax: 1,
      revenueMaxCents: 100n,
      expenseMaxCents: 100n,
      balanceMaxCents: 100n,
    });
    const dialog = openAdvanced();
    fireEvent.change(within(dialog).getByLabelText("Idade mínima"), { target: { value: "61" } });
    fireEvent.change(within(dialog).getByLabelText("Patrimônio mínimo"), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText("Quantidade mínima de bens"), { target: { value: "4" } });
    fireEvent.change(within(dialog).getByLabelText("Receita mínima"), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText("Despesa mínima"), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText("Saldo mínimo"), { target: { value: "2" } });

    for (const message of [
      "A idade mínima deve ser menor ou igual à idade máxima.",
      "O patrimônio mínimo deve ser menor ou igual ao patrimônio máximo.",
      "A quantidade mínima deve ser menor ou igual à quantidade máxima.",
      "A receita mínima deve ser menor ou igual à receita máxima.",
      "A despesa mínima deve ser menor ou igual à despesa máxima.",
      "O saldo mínimo deve ser menor ou igual ao saldo máximo.",
    ]) expect(within(dialog).getByText(message)).toHaveRole("alert");
    expect(within(dialog).getByRole("button", { name: "Aplicar filtros" })).toBeDisabled();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed campaign money locally with the error on its own range", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderFilters();
    const dialog = openAdvanced();
    fireEvent.change(within(dialog).getByLabelText("Receita mínima"), { target: { value: "mil reais" } });

    expect(within(dialog).getByText("Informe valores de receita em reais, usando apenas números e centavos.")).toHaveRole("alert");
    expect(within(dialog).queryByText("O patrimônio mínimo deve ser menor ou igual ao patrimônio máximo.")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Aplicar filtros" })).toBeDisabled();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts signed balance inputs and emits them through the native GET form", () => {
    renderFilters({ balanceMinCents: -12_345n, balanceMaxCents: -1n });
    const dialog = openAdvanced();

    expect(within(dialog).getByLabelText("Saldo mínimo")).toHaveValue("-123,45");
    expect(within(dialog).getByLabelText("Saldo máximo")).toHaveValue("-0,01");
    const form = dialog.querySelector("form")!;
    const data = new FormData(form);
    expect(data.get("saldoMin")).toBe("-123.45");
    expect(data.get("saldoMax")).toBe("-0.01");
    expect(within(dialog).getByRole("button", { name: "Aplicar filtros" })).toBeEnabled();
  });

  it("caps every repeated group at twenty choices", () => {
    const parties = Array.from({ length: 21 }, (_, index) => `P${String(index).padStart(2, "0")}`);
    renderFilters({ parties: parties.slice(0, 20) }, true, undefined, { ...options, parties });
    const dialog = openAdvanced();
    const group = within(dialog).getByRole("group", { name: "Partido" });

    expect(within(group).getByText("Limite de 20 opções atingido.")).toHaveAttribute("aria-live", "polite");
    expect(within(group).getByRole("checkbox", { name: "P20" })).toBeDisabled();
    expect(within(group).getByRole("checkbox", { name: "P00" })).not.toBeDisabled();
  });

  it("provides a named modal, traps focus, closes on Escape and returns focus", () => {
    renderFilters();
    const trigger = screen.getByRole("button", { name: /filtros avançados/i });
    const dialog = openAdvanced();
    const close = within(dialog).getByRole("button", { name: "Fechar filtros avançados" });
    const apply = within(dialog).getByRole("button", { name: "Aplicar filtros" });

    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(apply).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("removes one chip value without dropping other filters or the Brazil opt-out", () => {
    render(<CandidateFilterChips
      comparison={{ year: 2026, ids: ["4040", "1010"] }}
      filters={{
        allBrazil: true,
        query: "ana",
        offices: ["deputado_federal", "senador"],
        parties: ["ABC"],
        ageMin: 30,
        hasPhoto: false,
        topics: ["Educação"],
        order: "votes_desc",
        page: 4,
      }}
    />);

    const href = screen.getByRole("link", { name: "Remover cargo Deputado federal" }).getAttribute("href") ?? "";
    const params = new URL(href, "https://local.invalid").searchParams;
    expect(params.getAll("cargo")).toEqual(["senador"]);
    expect(params.get("q")).toBe("ana");
    expect(params.get("partido")).toBe("ABC");
    expect(params.get("idadeMin")).toBe("30");
    expect(params.get("comFoto")).toBe("0");
    expect(params.get("tema")).toBe("Educação");
    expect(params.get("abrangencia")).toBe("brasil");
    expect(params.get("compararAno")).toBe("2026");
    expect(params.getAll("compararId")).toEqual(["4040", "1010"]);
    expect(params.has("pagina")).toBe(false);
    expect(screen.getByRole("link", { name: "Limpar todos os filtros" })).toHaveAttribute(
      "href",
      "/candidatos?abrangencia=brasil&compararAno=2026&compararId=4040&compararId=1010",
    );
  });

  it("keeps the Brazil opt-out when the last explicit UF chip is removed", () => {
    render(<CandidateFilterChips filters={{ regions: ["ES"], topics: ["Educação"] }} />);

    const href = screen.getByRole("link", { name: "Remover UF ES" }).getAttribute("href") ?? "";
    const params = new URL(href, "https://local.invalid").searchParams;
    expect(params.get("abrangencia")).toBe("brasil");
    expect(params.has("uf")).toBe(false);
    expect(params.get("tema")).toBe("Educação");
  });

  it("preserves every filter and sorting choice in pagination", () => {
    render(<CandidatePagination filters={{
      allBrazil: true,
      electionYears: [2026],
      offices: ["senador"],
      statuses: ["APTO"],
      assetMinCents: 0n,
      hasFinance: false,
      order: "revenue_desc",
      page: 2,
    }} comparison={{ year: 2026, ids: ["4040", "1010"] }} page={2} totalPages={4} />);

    const previous = new URL(screen.getByRole("link", { name: "Página anterior" }).getAttribute("href")!, "https://local.invalid");
    const next = new URL(screen.getByRole("link", { name: "Próxima página" }).getAttribute("href")!, "https://local.invalid");
    expect(previous.searchParams.get("pagina")).toBeNull();
    expect(next.searchParams.get("pagina")).toBe("3");
    for (const params of [previous.searchParams, next.searchParams]) {
      expect(params.get("abrangencia")).toBe("brasil");
      expect(params.get("ano")).toBe("2026");
      expect(params.get("cargo")).toBe("senador");
      expect(params.get("situacao")).toBe("APTO");
      expect(params.get("patrimonioMin")).toBe("0");
      expect(params.get("comFinancas")).toBe("0");
      expect(params.get("ordem")).toBe("revenue_desc");
      expect(params.get("compararAno")).toBe("2026");
      expect(params.getAll("compararId")).toEqual(["4040", "1010"]);
    }
  });

  it("renders official identity, availability and zero monetary values without scoring", () => {
    render(<CandidateCard candidate={candidate} />);

    expect(screen.getByRole("img", { name: "Foto oficial de ANA CIDADÃ" })).toHaveAttribute("src", candidate.photoUrl);
    expect(screen.getByText("1234")).toHaveClass("candidateCard__number");
    expect(screen.getByRole("heading", { name: "ANA CIDADÃ" })).toBeVisible();
    expect(screen.getByText("ANA MARIA CIDADÃ")).toBeVisible();
    expect(screen.getByText("Situação oficial: APTO")).toBeVisible();
    expect(screen.getByText("Patrimônio declarado: R$ 0,00 · 1 bem")).toBeVisible();
    expect(screen.getByText("Receita: R$ 0,00")).toBeVisible();
    expect(screen.getByText("Despesa: R$ 1.500,50")).toBeVisible();
    expect(screen.getByText("Histórico parlamentar confirmado")).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver perfil de ANA CIDADÃ" })).toHaveAttribute("href", "/candidatos/2026/260001234567");
    expect(screen.queryByText(/nota|melhor|ranking|vencedor/i)).not.toBeInTheDocument();
  });

  it("distinguishes absent money from zero and falls back after a failed photo", () => {
    render(<CandidateCard candidate={{
      ...candidate,
      assetTotalCents: null,
      assetCount: 0,
      finance: null,
      hasFinance: false,
      hasConfirmedLawmaker: false,
    }} />);
    fireEvent.error(screen.getByRole("img", { name: "Foto oficial de ANA CIDADÃ" }));

    expect(screen.queryByRole("img", { name: "Foto oficial de ANA CIDADÃ" })).not.toBeInTheDocument();
    expect(screen.getByText("Foto não disponibilizada")).toBeVisible();
    expect(screen.getByText("Patrimônio: não informado pela fonte")).toBeVisible();
    expect(screen.getByText("Finanças: ainda não disponibilizadas pelo TSE")).toBeVisible();
    expect(screen.getByText("Histórico parlamentar não confirmado")).toBeVisible();
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
  });

  it("formats PostgreSQL bigint monetary boundaries without losing centavos", () => {
    render(<CandidateCard candidate={{ ...candidate, assetTotalCents: "9223372036854775807", assetCount: 1, finance: null }} />);

    expect(screen.getByText("Patrimônio declarado: R$ 92.233.720.368.547.758,07 · 1 bem")).toBeVisible();
  });

  it("renders results, neutral empty state and catalog pagination", () => {
    const page: PublicCandidatePage = { items: [candidate], page: 1, pageSize: 20, total: 21, totalPages: 2 };
    const view = render(<CandidateResults candidates={page} filters={{ order: "name" }} snapshotExtractedAt="2026-08-20T12:00:00.000Z" />);
    expect(screen.getByRole("heading", { name: "Candidaturas encontradas" })).toBeVisible();
    expect(screen.getByText("candidaturas oficiais")).toBeVisible();
    expect(screen.getByText("21")).toBeVisible();
    expect(screen.getByRole("link", { name: "Próxima página" })).toBeVisible();

    view.rerender(<CandidateResults candidates={{ ...page, items: [], total: 0, totalPages: 1 }} filters={{ regions: ["ES"] }} snapshotExtractedAt={null} />);
    expect(screen.getByRole("heading", { name: "Nenhuma candidatura apareceu com esses filtros." })).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver todas as candidaturas" })).toHaveAttribute("href", "/candidatos");

    view.rerender(<CandidateResults candidates={{ ...page, items: [], total: 0, totalPages: 1 }} filters={{ allBrazil: true, parties: ["ABC"] }} snapshotExtractedAt={null} />);
    expect(screen.getByRole("link", { name: "Ver todas as candidaturas" })).toHaveAttribute("href", "/candidatos?abrangencia=brasil");
  });

  it("keeps the ballot tab, one-column mobile catalog and reduced-motion safeguards in CSS", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.candidateCard__number\s*\{[^}]*background:\s*var\(--yellow\)/);
    expect(css).toMatch(/\.candidateGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
    expect(css).toMatch(/@media \(max-width: 720px\) \{[\s\S]*?\.candidateGrid\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(css).toMatch(/@media \(max-width: 720px\) \{[\s\S]*?\.candidateAdvancedFilters\s*\{[^}]*width:\s*100vw/);
    expect(css).toMatch(/@media \(max-width: 420px\) \{[\s\S]*?\.siteNav__account span\s*\{[^}]*width:\s*1px/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.candidateAdvancedFilters,\s*\.candidateAdvancedFilters::backdrop\s*\{[^}]*animation-duration/);
  });
});
