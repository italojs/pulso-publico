// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicBillFilters, PublicFilterOptions } from "#/server/public/read-models";
import { LOCAL_FOLLOWS_KEY } from "#/follows/local";
import { AnonymousFollowedResults } from "#/ui/anonymous-followed-results";
import { FeedFilters } from "#/ui/feed-filters";
import { Pagination } from "#/ui/pagination";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation.js", () => ({ useRouter: () => ({ push: routerPush }) }));

const options = {
  sources: ["camara", "senado"], proposalTypes: ["PEC", "PL"], years: [2024, 2025, 2026],
  originHouses: [{ value: "camara", label: "Câmara dos Deputados" }, { value: "senado", label: "Senado Federal" }],
  currentHouses: [{ value: "camara", label: "Câmara dos Deputados" }, { value: "senado", label: "Senado Federal" }, { value: "nao_informada", label: "Texto técnico incorreto" }],
  stages: [{ value: "committees", label: "Em comissões" }, { value: "ready_for_vote", label: "Pronto para votação" }],
  statuses: ["Em análise", "Pronta para pauta"],
  voteKinds: [{ value: "nominal", label: "Nominal" }, { value: "non_nominal", label: "Não nominal" }],
  voteResults: [{ value: "approved", label: "Aprovada" }, { value: "rejected", label: "Rejeitada" }],
  voteHouses: [{ value: "camara", label: "Câmara dos Deputados" }, { value: "senado", label: "Senado Federal" }],
  topics: ["Educação", "Trabalho e Emprego"], parties: ["ABC", "XYZ"], authors: ["Ana Cidadã", "Bruno Federal"],
  regions: [{ value: "PE", label: "PE" }, { value: "SP", label: "SP" }, { value: "nao_informada", label: "Texto técnico incorreto" }],
} satisfies PublicFilterOptions;

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  document.body.style.overflow = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  routerPush.mockReset();
});

const project = {
  source: "camara" as const,
  externalId: "501",
  officialCode: "PEC 8/2025",
  officialTitle: "Proposta de Emenda à Constituição nº 8, de 2025",
  officialSummary: "Reduz a jornada semanal e altera a escala de trabalho.",
  officialUrl: "https://www.camara.leg.br/propostas-legislativas/501",
  statusLabel: "Aguardando parecer na comissão",
  originHouse: "camara" as const,
  currentHouse: "camara" as const,
  presentedAt: "2025-02-01T12:00:00.000Z",
  checkedAt: "2026-09-03T12:00:00.000Z",
  latestActivityAt: "2026-08-31T18:00:00.000Z",
  topics: ["Trabalho e Emprego"],
  authors: [{
    source: "camara" as const,
    name: "Ana Cidadã",
    party: "ABC",
    kind: "Deputada Federal",
    primary: true,
    lawmakerExternalId: "100",
    officialUrl: "https://www.camara.leg.br/deputados/100",
  }],
};

const localBill = {
  kind: "bill" as const,
  source: "camara" as const,
  externalId: "501",
  label: "PEC 8/2025",
  href: "/projetos/camara/501",
  subtitle: "Aguardando parecer na comissão",
};

const localLawmaker = {
  kind: "lawmaker" as const,
  source: "senado" as const,
  externalId: "200",
  label: "Bruno Federal",
  href: "/parlamentares/senado/200",
};

function renderFilters(filters: PublicBillFilters = {}, customOptions = options) {
  return render(<FeedFilters filters={filters} options={customOptions} />);
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /filtros avançados/i }));
  return screen.getByRole("dialog", { name: /filtros avançados/i });
}

describe("advanced feed filters", () => {
  it("loads anonymous followed bills without exposing references and paginates through POST", async () => {
    window.history.replaceState(null, "", "/?acompanhando=1&tema=Trabalho");
    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify([localBill, localLawmaker]));
    const searchRequests: Array<{ anonymousBillKeys: unknown[]; filters: PublicBillFilters }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== "/api/projects/search") return new Response(null, { status: 401 });
      const body = JSON.parse(String(init?.body)) as { anonymousBillKeys: unknown[]; filters: PublicBillFilters };
      searchRequests.push(body);
      return new Response(JSON.stringify({
        items: [project], page: body.filters.page, pageSize: 1, total: 2, totalPages: 2,
      }), { headers: { "content-type": "application/json" }, status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AnonymousFollowedResults filters={{ followedOnly: true, page: 1, pageSize: 1, topics: ["Trabalho"] }} />);

    expect(await screen.findByRole("link", { name: /PEC 8\/2025/ })).toHaveAttribute("href", "/projetos/camara/501");
    expect(searchRequests[0]).toEqual({
      anonymousBillKeys: [{ source: "camara", externalId: "501" }],
      filters: { followedOnly: true, page: 1, pageSize: 1, topics: ["Trabalho"] },
    });
    expect(window.location.search).toBe("?acompanhando=1&tema=Trabalho");

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(searchRequests).toHaveLength(2));
    expect(searchRequests[1]).toEqual({
      anonymousBillKeys: [{ source: "camara", externalId: "501" }],
      filters: { followedOnly: true, page: 2, pageSize: 1, topics: ["Trabalho"] },
    });
    expect(window.location.search).toBe("?acompanhando=1&tema=Trabalho");
  });

  it("resets anonymous pagination before searching with changed URL filters", async () => {
    window.history.replaceState(null, "", "/?acompanhando=1&tema=Trabalho");
    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify([localBill]));
    const searchRequests: PublicBillFilters[] = [];
    const healthProject = {
      ...project,
      source: "senado" as const,
      externalId: "601",
      officialCode: "PL 12/2024",
      officialTitle: "Projeto de Lei nº 12, de 2024",
      topics: ["Saúde"],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== "/api/projects/search") return new Response(null, { status: 401 });
      const body = JSON.parse(String(init?.body)) as { filters: PublicBillFilters };
      searchRequests.push(body.filters);
      const item = body.filters.topics?.includes("Saúde") ? healthProject : project;
      return new Response(JSON.stringify({
        items: [item], page: body.filters.page, pageSize: 1, total: 2, totalPages: 2,
      }), { headers: { "content-type": "application/json" }, status: 200 });
    }));

    const view = render(<AnonymousFollowedResults filters={{ followedOnly: true, page: 1, pageSize: 1, topics: ["Trabalho"] }} />);
    await screen.findByRole("link", { name: /PEC 8\/2025/ });
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(searchRequests).toHaveLength(2));
    expect(searchRequests[1]?.page).toBe(2);

    window.history.replaceState(null, "", "/?acompanhando=1&tema=Sa%C3%BAde");
    view.rerender(<AnonymousFollowedResults filters={{ followedOnly: true, page: 1, pageSize: 1, topics: ["Saúde"] }} />);

    expect(await screen.findByRole("link", { name: /PL 12\/2024/ })).toHaveAttribute("href", "/projetos/senado/601");
    expect(searchRequests).toHaveLength(3);
    expect(searchRequests[2]).toEqual({ followedOnly: true, page: 1, pageSize: 1, topics: ["Saúde"] });
    expect(new URLSearchParams(window.location.search).has("pagina")).toBe(false);
  });

  it("shows how to follow a project when anonymous storage has no bill", async () => {
    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify([localLawmaker]));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AnonymousFollowedResults filters={{ followedOnly: true }} />);

    expect(await screen.findByText("Você ainda não acompanha nenhum projeto.")).toBeInTheDocument();
    expect(screen.getByText(/use o botão “Seguir projeto”/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads, deduplicates and refreshes anonymous references when followed-only is first enabled", async () => {
    vi.useFakeTimers();
    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify([localBill, localBill, localLawmaker]));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ total: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderFilters();
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Mostrar somente projetos que acompanho" }));
    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      anonymousBillKeys: [{ source: "camara", externalId: "501" }],
      filters: { followedOnly: true },
    });

    localStorage.setItem(LOCAL_FOLLOWS_KEY, "[]");
    await act(async () => window.dispatchEvent(new Event("pulso:follows-changed")));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      anonymousBillKeys: [],
      filters: { followedOnly: true },
    });
  });

  it("refreshes anonymous followed results after unfollow and follow events on the open page", async () => {
    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify([localBill]));
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { filters: PublicBillFilters };
      return new Response(JSON.stringify({
        items: [project], page: body.filters.page ?? 1, pageSize: 20, total: 1, totalPages: 1,
      }), { headers: { "content-type": "application/json" }, status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AnonymousFollowedResults filters={{ followedOnly: true }} />);
    await screen.findByRole("link", { name: /PEC 8\/2025/ });

    localStorage.setItem(LOCAL_FOLLOWS_KEY, "[]");
    window.dispatchEvent(new Event("pulso:follows-changed"));
    expect(await screen.findByText("Você ainda não acompanha nenhum projeto.")).toBeInTheDocument();

    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify([localBill]));
    window.dispatchEvent(new Event("pulso:follows-changed"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("link", { name: /PEC 8\/2025/ })).toBeInTheDocument();
  });

  it("preserves advanced filters in SSR pagination and changes only the page", () => {
    const filters: PublicBillFilters = {
      proposalTypes: ["PEC", "PL"], sources: ["camara", "senado"],
      presentedStart: "2025-01-01", presentedEnd: "2025-12-31",
      activityStart: "2026-01-01", activityEnd: "2026-06-30",
      votePresence: "with", voteKinds: ["nominal", "secret"],
      voteResults: ["approved", "rejected"], voteHouses: ["camara", "senado"],
      order: "most_votes", page: 2,
    };
    render(<Pagination filters={filters} page={2} totalPages={4} />);

    const previous = new URL(screen.getByRole("link", { name: "Página anterior" }).getAttribute("href")!, "https://local.invalid").searchParams;
    const next = new URL(screen.getByRole("link", { name: "Próxima página" }).getAttribute("href")!, "https://local.invalid").searchParams;
    expect(previous.getAll("tipo")).toEqual(["PEC", "PL"]);
    expect(next.getAll("fonte")).toEqual(["camara", "senado"]);
    expect(next.get("apresentadaInicio")).toBe("2025-01-01");
    expect(next.get("apresentadaFim")).toBe("2025-12-31");
    expect(next.get("atividadeInicio")).toBe("2026-01-01");
    expect(next.get("atividadeFim")).toBe("2026-06-30");
    expect(next.get("votacao")).toBe("with");
    expect(next.getAll("tipoVotacao")).toEqual(["nominal", "secret"]);
    expect(next.getAll("resultado")).toEqual(["approved", "rejected"]);
    expect(next.getAll("casaVotacao")).toEqual(["camara", "senado"]);
    expect(next.get("ordem")).toBe("most_votes");
    expect(previous.get("pagina")).toBeNull();
    expect(next.get("pagina")).toBe("3");
    previous.delete("pagina");
    next.delete("pagina");
    expect([...next.entries()]).toEqual([...previous.entries()]);
  });

  it("server-renders the native dialog, invoker attributes, and named GET controls", () => {
    const html = renderToString(<FeedFilters filters={{
      proposalTypes: ["PEC"], proposalNumber: 12, yearFrom: 2024, yearTo: 2026,
      sources: ["camara", "senado"], statuses: ["Em análise"], topics: ["Educação"],
      originHouses: ["camara"], currentHouses: ["senado"], stages: ["committees"],
      presentedStart: "2025-01-01", presentedEnd: "2025-12-31", recentActivity: "30d",
      votePresence: "with", voteKinds: ["nominal"], individualVoteAvailability: "available",
      voteResults: ["approved"], voteHouses: ["camara"], authors: ["Ana Cidadã"],
      parties: ["ABC"], regions: ["PE"], followedOnly: true, order: "most_votes",
    }} options={options} />);

    expect(html).toContain("<dialog");
    expect(html).toContain('command="show-modal"');
    expect(html).toMatch(/commandfor="([^"]+)"[^>]*>[\s\S]*<dialog[^>]*id="\1"/);
    expect(html).toContain('command="close"');
    expect(html).not.toContain("aria-expanded");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('class="advancedFilters__clear" href="/"');
    for (const name of ["tipo", "numero", "anoInicio", "anoFim", "fonte", "situacao", "tema", "origem", "casaAtual", "fase", "apresentadaInicio", "apresentadaFim", "atividadeRecente", "votacao", "tipoVotacao", "votosIndividuais", "resultado", "casaVotacao", "autor", "partido", "uf", "acompanhando", "ordem"]) {
      expect(html).toContain(`name="${name}"`);
    }
    const customActivityHtml = renderToString(<FeedFilters filters={{ activityStart: "2025-01-01", activityEnd: "2025-12-31" }} options={options} />);
    expect(customActivityHtml).toContain('name="atividadeInicio"');
    expect(customActivityHtml).toContain('name="atividadeFim"');
    const dialogHtml = html.slice(html.indexOf("<dialog"));
    expect(dialogHtml).not.toMatch(/type="hidden"[^>]+name="(tipo|fonte|situacao|tema)"/);
    expect(html.match(/<form/g)).toHaveLength(2);
  });

  it("submits quick and advanced filters through separate forms without duplicate dimensions", () => {
    const view = renderFilters({
      query: "jornada", sources: ["camara", "senado"], statuses: ["Em análise", "Pronta para pauta"],
      topics: ["Educação", "Trabalho e Emprego"], proposalTypes: ["PEC", "PL"], page: 8,
    });
    const quickForm = view.container.querySelector<HTMLFormElement>('form[aria-label="Filtros rápidos"]');
    const advancedForm = view.container.querySelector<HTMLFormElement>("dialog form");
    expect(quickForm).not.toBeNull();
    expect(advancedForm).not.toBeNull();

    fireEvent.change(within(quickForm!).getByRole("searchbox", { name: "Buscar projetos" }), { target: { value: "jornada semanal" } });
    const quickInitial = new FormData(quickForm!);
    expect([...quickInitial.entries()]).toEqual([
      ["q", "jornada semanal"], ["fonte", "camara"], ["fonte", "senado"],
      ["situacao", "Em análise"], ["situacao", "Pronta para pauta"],
      ["tema", "Educação"], ["tema", "Trabalho e Emprego"],
      ["tipo", "PEC"], ["tipo", "PL"],
    ]);
    expect(quickInitial.getAll("fonte")).toEqual(["camara", "senado"]);
    expect(quickInitial.getAll("situacao")).toEqual(["Em análise", "Pronta para pauta"]);
    expect(quickInitial.getAll("tema")).toEqual(["Educação", "Trabalho e Emprego"]);
    expect(quickInitial.getAll("tipo")).toEqual(["PEC", "PL"]);
    expect(quickInitial.has("pagina")).toBe(false);

    fireEvent.change(within(quickForm!).getByRole("combobox", { name: "Casa legislativa" }), { target: { value: "senado" } });
    expect([...new FormData(quickForm!).entries()]).toEqual([
      ["q", "jornada semanal"], ["fonte", "senado"],
      ["situacao", "Em análise"], ["situacao", "Pronta para pauta"],
      ["tema", "Educação"], ["tema", "Trabalho e Emprego"],
      ["tipo", "PEC"], ["tipo", "PL"],
    ]);
    fireEvent.change(within(quickForm!).getByRole("combobox", { name: "Casa legislativa" }), { target: { value: "" } });
    expect([...new FormData(quickForm!).entries()]).toEqual([
      ["q", "jornada semanal"],
      ["situacao", "Em análise"], ["situacao", "Pronta para pauta"],
      ["tema", "Educação"], ["tema", "Trabalho e Emprego"],
      ["tipo", "PEC"], ["tipo", "PL"],
    ]);

    const advanced = new FormData(advancedForm!);
    expect(advanced.getAll("fonte")).toEqual(["camara", "senado"]);
    expect(advanced.getAll("situacao")).toEqual(["Em análise", "Pronta para pauta"]);
    expect(advanced.getAll("tema")).toEqual(["Educação", "Trabalho e Emprego"]);
    expect(advanced.getAll("q")).toEqual(["jornada"]);
    expect(advanced.has("pagina")).toBe(false);
  });

  it("resynchronizes both controlled forms after canonical URL navigation", () => {
    const view = renderFilters({ query: "jornada", sources: ["camara"], statuses: ["Em análise"] });

    view.rerender(<FeedFilters filters={{ query: "saúde", sources: ["senado"], statuses: ["Pronta para pauta"], topics: ["Educação"] }} options={options} />);

    const quickForm = screen.getByRole("form", { name: "Filtros rápidos" });
    expect(within(quickForm).getByRole("searchbox", { name: "Buscar projetos" })).toHaveValue("saúde");
    expect(within(quickForm).getByRole("combobox", { name: "Casa legislativa" })).toHaveValue("senado");
    expect(within(quickForm).getByRole("combobox", { name: "Situação atual" })).toHaveValue("Pronta para pauta");
    const advancedForm = openDialog().querySelector("form")!;
    expect(new FormData(advancedForm).getAll("q")).toEqual(["saúde"]);
    expect(new FormData(advancedForm).getAll("fonte")).toEqual(["senado"]);
  });

  it("uses seven native collapsible regions and semantic filter groups", () => {
    renderFilters();
    const dialog = openDialog();

    for (const name of ["Identificação", "Tramitação", "Datas e atividade", "Votações", "Assuntos e autoria", "Acompanhamento", "Ordenação"]) {
      const region = within(dialog).getByRole("region", { name });
      const details = region.querySelector("details");
      expect(details).toBeInstanceOf(HTMLDetailsElement);
      expect(details?.querySelector("summary")).toHaveTextContent(name);
    }
    for (const name of [
      "Tipo de projeto", "Casa legislativa", "Situação atual", "Tema", "Casa de origem", "Casa atual", "Fase geral",
      "Há votação registrada?", "Tipo de votação", "Votos individuais", "Resultado", "Casa da votação",
      "Autoria", "Partido", "Estado ou região", "Projetos acompanhados",
    ]) {
      expect(within(dialog).getByRole("group", { name })).toBeInstanceOf(HTMLFieldSetElement);
    }
    expect(within(dialog).getAllByRole("radio", { name: /votação/i }).map((radio) => radio.getAttribute("name"))).toEqual(["votacao", "votacao"]);
    expect(within(dialog).getAllByRole("radio", { name: /disponíveis/i }).map((radio) => radio.getAttribute("name"))).toEqual(["votosIndividuais", "votosIndividuais"]);
    expect(within(dialog).getAllByRole("checkbox", { name: "Não informada" })).toHaveLength(2);
  });

  it("traps focus with an active query, closes from Escape and backdrop, and cleans body scroll", () => {
    const view = renderFilters({ query: "jornada" });
    const trigger = screen.getByRole("button", { name: /filtros avançados/i });
    let dialog = openDialog();
    const close = within(dialog).getByRole("button", { name: "Fechar filtros avançados" });
    const apply = within(dialog).getByRole("button", { name: /aplicar filtros/i });

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

    dialog = openDialog();
    fireEvent.mouseDown(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    openDialog();
    view.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("searches large situation, topic and author catalogs without rendering every checkbox", () => {
    const largeOptions: PublicFilterOptions = {
      ...options,
      proposalTypes: Array.from({ length: 110 }, (_, index) => `T${String(index).padStart(3, "0")}`),
      statuses: Array.from({ length: 523 }, (_, index) => `Situação ${String(index).padStart(3, "0")}`),
      topics: Array.from({ length: 240 }, (_, index) => `Tema ${String(index).padStart(3, "0")}`),
      authors: Array.from({ length: 180 }, (_, index) => `Autoria ${String(index).padStart(3, "0")}`),
      parties: Array.from({ length: 30 }, (_, index) => `P${String(index).padStart(2, "0")}`),
    };
    renderFilters({}, largeOptions);
    const dialog = openDialog();

    expect(within(dialog).getAllByRole("checkbox").length).toBeLessThan(100);
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Pesquisar tipos" }), { target: { value: "T109" } });
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Pesquisar situações" }), { target: { value: "Situação 522" } });
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Pesquisar temas" }), { target: { value: "Tema 239" } });
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Pesquisar autoria" }), { target: { value: "Autoria 179" } });
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Pesquisar partidos" }), { target: { value: "P29" } });
    expect(within(dialog).getByRole("checkbox", { name: "T109" })).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Situação 522" })).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Tema 239" })).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Autoria 179" })).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "P29" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox", { name: "Situação 000" })).not.toBeInTheDocument();
  });

  it("keeps obsolete selected values marked as unavailable until explicit removal", () => {
    renderFilters({ proposalTypes: ["SBE-A"], yearFrom: 1999, statuses: ["Situação antiga"], topics: ["Tema antigo"], authors: ["Autoria antiga"] });
    const dialog = openDialog();

    for (const name of ["SBE-A — indisponível", "Situação antiga — indisponível", "Tema antigo — indisponível", "Autoria antiga — indisponível"]) {
      expect(within(dialog).getByRole("checkbox", { name })).toBeChecked();
    }
    expect(within(dialog).getByRole("option", { name: "1999 — indisponível" })).toHaveProperty("selected", true);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Situação antiga — indisponível" }));
    expect(new FormData(within(dialog).getByRole("button", { name: /aplicar filtros/i }).closest("form")!).getAll("situacao")).toEqual([]);
  });

  it("offers neutral radio choices that clear only their own vote filters", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ total: 2 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderFilters({ votePresence: "with", individualVoteAvailability: "available", voteKinds: ["nominal"] });
    const dialog = openDialog();

    fireEvent.click(within(dialog).getByRole("radio", { name: "Todos" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "Qualquer situação" }));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    const body = JSON.parse(String((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body));
    expect(body.filters).toEqual({ voteKinds: ["nominal"] });
    const data = new FormData(dialog.querySelector("form")!);
    expect(data.has("votacao")).toBe(false);
    expect(data.has("votosIndividuais")).toBe(false);
  });

  it("offers source, status and topic multi-selects and exactly the approved activity choices", () => {
    renderFilters({ sources: ["camara", "senado"], statuses: ["Em análise", "Pronta para pauta"], topics: ["Educação", "Trabalho e Emprego"] });
    const dialog = openDialog();

    expect(within(within(dialog).getByRole("group", { name: "Casa legislativa" })).getByRole("checkbox", { name: "Senado Federal" })).toBeChecked();
    expect(within(within(dialog).getByRole("group", { name: "Situação atual" })).getByRole("checkbox", { name: "Pronta para pauta" })).toBeChecked();
    expect(within(within(dialog).getByRole("group", { name: "Tema" })).getByRole("checkbox", { name: "Trabalho e Emprego" })).toBeChecked();
    expect(within(within(dialog).getByRole("group", { name: "Casa legislativa" })).getAllByRole("checkbox").every((checkbox) => !checkbox.hasAttribute("disabled"))).toBe(true);
    expect(within(dialog).getByRole("combobox", { name: "Período de atividade" })).toHaveTextContent("Últimas 24 horasÚltimos 7 diasÚltimos 30 diasPeríodo personalizado");
    expect(within(dialog).queryByText("Últimos 12 meses")).not.toBeInTheDocument();
  });

  it("keeps an empty custom activity mode selected", () => {
    renderFilters();
    const dialog = openDialog();
    const activityMode = within(dialog).getByRole("combobox", { name: "Período de atividade" });
    const optionValues = within(activityMode).getAllByRole("option").map((option) => (option as HTMLOptionElement).value);
    expect(optionValues).toEqual(["", "24h", "7d", "30d", "custom"]);

    fireEvent.change(activityMode, { target: { value: "custom" } });
    expect(activityMode).toHaveValue("custom");
    expect(within(dialog).getByLabelText("Atividade desde")).toHaveValue("");
    expect(within(dialog).getByLabelText("Atividade até")).toHaveValue("");
  });

  it("caps each repeated group at twenty and disables unchecked choices at the limit", () => {
    const types = Array.from({ length: 21 }, (_, index) => `T${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`);
    renderFilters({ proposalTypes: types.slice(0, 20) }, { ...options, proposalTypes: types });
    const dialog = openDialog();
    const group = within(dialog).getByRole("group", { name: "Tipo de projeto" });

    expect(within(group).getByText("Limite de 20 opções atingido.")).toHaveAttribute("aria-live", "polite");
    expect(within(group).getByRole("checkbox", { name: types[20] })).toBeDisabled();
    expect(within(group).getByRole("checkbox", { name: types[0] })).not.toBeDisabled();
  });

  it("sends exactly twenty selected values and prevents a twenty-first preview value", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ total: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const types = Array.from({ length: 21 }, (_, index) => `T${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`);
    renderFilters({ proposalTypes: types.slice(0, 20) }, { ...options, proposalTypes: types });
    const dialog = openDialog();
    expect(within(dialog).getByRole("checkbox", { name: types[20] })).toBeDisabled();

    await act(async () => vi.advanceTimersByTimeAsync(300));
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.filters.proposalTypes).toEqual(types.slice(0, 20));
    expect(body.filters.proposalTypes).toHaveLength(20);
  });

  it("shows Portuguese interval errors, disables Apply and skips the count preview", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderFilters({ yearFrom: 2026, yearTo: 2024, presentedStart: "2026-02-01", presentedEnd: "2026-01-01", activityStart: "2026-04-01", activityEnd: "2026-03-01" });
    const dialog = openDialog();

    expect(within(dialog).getByText("O ano inicial deve ser anterior ou igual ao ano final.")).toHaveRole("alert");
    expect(within(dialog).getByText("A data inicial de apresentação deve ser anterior ou igual à data final.")).toHaveRole("alert");
    expect(within(dialog).getByText("A data inicial de atividade deve ser anterior ou igual à data final.")).toHaveRole("alert");
    for (const [field, message] of [
      ["Ano inicial", "O ano inicial deve ser anterior ou igual ao ano final."],
      ["Ano final", "O ano inicial deve ser anterior ou igual ao ano final."],
      ["Apresentada desde", "A data inicial de apresentação deve ser anterior ou igual à data final."],
      ["Apresentada até", "A data inicial de apresentação deve ser anterior ou igual à data final."],
      ["Atividade desde", "A data inicial de atividade deve ser anterior ou igual à data final."],
      ["Atividade até", "A data inicial de atividade deve ser anterior ou igual à data final."],
    ] as const) {
      const input = within(dialog).getByLabelText(field);
      const error = within(dialog).getByText(message);
      expect(error.id).not.toBe("");
      expect(input).toHaveAttribute("aria-describedby", error.id);
      expect(input).toHaveAttribute("aria-errormessage", error.id);
    }
    expect(within(dialog).getByRole("button", { name: /aplicar filtros/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aplicar", exact: true })).not.toBeDisabled();
    expect(new FormData(screen.getByRole("button", { name: "Aplicar", exact: true }).closest("form")!).has("pagina")).toBe(false);
    expect(new FormData(within(dialog).getByRole("button", { name: /aplicar filtros/i }).closest("form")!).has("pagina")).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits the first advanced URL through the canonical serializer without empty parameters", () => {
    renderFilters();
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "PL" }));
    fireEvent.submit(within(dialog).getByRole("button", { name: /aplicar filtros/i }).closest("form")!);

    expect(routerPush).toHaveBeenCalledWith("/?tipo=PL");
    expect(routerPush.mock.calls[0]?.[0]).not.toContain("=&");
    expect(routerPush.mock.calls[0]?.[0]).not.toMatch(/(?:numero|anoInicio|anoFim|apresentadaInicio|apresentadaFim|atividadeRecente|atividadeInicio|atividadeFim|ordem)=/);
  });

  it("debounces and sends an exact sanitized canonical preview body", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ total: 42 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderFilters({ query: "jornada", proposalTypes: ["PEC"], sources: ["camara", "senado"], statuses: ["Em análise"], topics: ["Educação"], recentActivity: "7d", votePresence: "with", page: 9, pageSize: 50, source: "camara", proposalType: "PEC" });
    openDialog();
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ anonymousBillKeys: [], filters: {
      query: "jornada", proposalTypes: ["PEC"], sources: ["camara", "senado"], statuses: ["Em análise"], topics: ["Educação"], recentActivity: "7d", votePresence: "with",
    } });
    expect(screen.getByRole("status")).toHaveTextContent("42 projetos encontrados");
  });

  it("aborts a stale request and keeps the last valid count after an error", async () => {
    vi.useFakeTimers();
    let requestNumber = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestNumber += 1;
      if (requestNumber === 1) return Promise.resolve(new Response(JSON.stringify({ total: 18 }), { status: 200 }));
      if (requestNumber === 2) return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
      return Promise.reject(new Error("network unavailable"));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderFilters();
    const dialog = openDialog();
    await act(async () => vi.advanceTimersByTimeAsync(300));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "PEC" }));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    const staleSignal = fetchMock.mock.calls[1]?.[1]?.signal;
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "PL" }));
    expect(staleSignal?.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível atualizar a contagem");
    expect(within(dialog).getByRole("button", { name: "Ver 18 projetos" })).toBeInTheDocument();
  });

  it("removes one chip while preserving unrelated filters and resetting pagination", () => {
    renderFilters({ proposalTypes: ["PEC", "PL"], sources: ["camara"], activityStart: "2025-01-01", activityEnd: "2025-12-31", page: 3 });
    const typeHref = screen.getByRole("link", { name: "Remover tipo PEC" }).getAttribute("href") ?? "";
    expect(typeHref).toContain("tipo=PL");
    expect(typeHref).toContain("fonte=camara");
    expect(typeHref).toContain("atividadeInicio=2025-01-01");
    expect(typeHref).not.toContain("tipo=PEC");
    expect(typeHref).not.toContain("pagina=");
    const activityStartHref = screen.getByRole("link", { name: "Remover atividade desde 01/01/2025" }).getAttribute("href") ?? "";
    expect(activityStartHref).toContain("atividadeFim=2025-12-31");
    expect(activityStartHref).not.toContain("atividadeInicio");
  });

  it("removes only the canonical activity preset and preserves the other filters", () => {
    renderFilters({ recentActivity: "30d", sources: ["senado"], page: 4 });
    const href = screen.getByRole("link", { name: "Remover atividade últimos 30 dias" }).getAttribute("href") ?? "";
    expect(href).toContain("fonte=senado");
    expect(href).not.toContain("atividadeRecente");
    expect(href).not.toContain("atividadeInicio");
    expect(href).not.toContain("pagina=");
    expect(screen.getByRole("link", { name: "Limpar tudo" })).toHaveAttribute("href", "/");
  });

  it("keeps full-screen mobile and reduced-motion CSS rules", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.advancedFiltersTrigger strong \{[^}]*display: grid;/);
    expect(css).toMatch(/\.advancedFilters \{[^}]*display: block;/);
    expect(css).toMatch(/\.advancedFilters__form \{[^}]*display: grid;[^}]*grid-template-rows:/);
    expect(css).toMatch(/@media \(max-width: 720px\) \{[\s\S]*?\.advancedFilters \{ width: 100vw; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.advancedFilters, \.advancedFilters::backdrop \{[^}]*animation-duration/);
  });
});
