// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicBillFilters, PublicFilterOptions } from "#/server/public/read-models";
import { FeedFilters } from "#/ui/feed-filters";

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
  document.body.style.overflow = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderFilters(filters: PublicBillFilters = {}, customOptions = options) {
  return render(<FeedFilters filters={filters} options={customOptions} />);
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /filtros avançados/i }));
  return screen.getByRole("dialog", { name: /filtros avançados/i });
}

describe("advanced feed filters", () => {
  it("server-renders the native dialog, invoker attributes, and named GET controls", () => {
    const html = renderToString(<FeedFilters filters={{ proposalTypes: ["PEC"], sources: ["camara", "senado"] }} options={options} />);

    expect(html).toContain("<dialog");
    expect(html).toContain('command="show-modal"');
    expect(html).toMatch(/commandfor="([^"]+)"[^>]*>[\s\S]*<dialog[^>]*id="\1"/);
    for (const name of ["tipo", "numero", "anoInicio", "anoFim", "fonte", "situacao", "tema", "origem", "casaAtual", "fase", "apresentadaInicio", "apresentadaFim", "atividadeRecente", "atividadeInicio", "atividadeFim", "votacao", "tipoVotacao", "votosIndividuais", "resultado", "casaVotacao", "autor", "partido", "uf", "acompanhando", "ordem"]) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html).not.toMatch(/type="hidden"[^>]+name="(tipo|fonte|situacao|tema)"/);
  });

  it("uses regions for section headings and fieldset/legend groups with named radios", () => {
    renderFilters();
    const dialog = openDialog();

    for (const name of ["Identificação", "Tramitação", "Votações", "Autoria e representação", "Ordem dos resultados"]) {
      expect(within(dialog).getByRole("region", { name })).toBeInTheDocument();
    }
    for (const name of ["Tipo de projeto", "Casa legislativa", "Situação atual", "Tema", "Há votação registrada?", "Votos individuais"]) {
      expect(within(dialog).getByRole("group", { name })).toBeInstanceOf(HTMLFieldSetElement);
    }
    expect(within(dialog).getAllByRole("radio", { name: /votação/i }).map((radio) => radio.getAttribute("name"))).toEqual(["votacao", "votacao"]);
    expect(within(dialog).getAllByRole("radio", { name: /disponíveis/i }).map((radio) => radio.getAttribute("name"))).toEqual(["votosIndividuais", "votosIndividuais"]);
    expect(within(dialog).getAllByRole("checkbox", { name: "Não informada" })).toHaveLength(2);
  });

  it("traps focus in both directions, closes from Escape and backdrop, and cleans body scroll", () => {
    const view = renderFilters();
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

  it("offers source, status and topic multi-selects and exactly the approved activity choices", () => {
    renderFilters({ sources: ["camara", "senado"], statuses: ["Em análise", "Pronta para pauta"], topics: ["Educação", "Trabalho e Emprego"] });
    const dialog = openDialog();

    expect(within(within(dialog).getByRole("group", { name: "Casa legislativa" })).getByRole("checkbox", { name: "Senado Federal" })).toBeChecked();
    expect(within(within(dialog).getByRole("group", { name: "Situação atual" })).getByRole("checkbox", { name: "Pronta para pauta" })).toBeChecked();
    expect(within(within(dialog).getByRole("group", { name: "Tema" })).getByRole("checkbox", { name: "Trabalho e Emprego" })).toBeChecked();
    expect(within(dialog).getByRole("combobox", { name: "Período de atividade" })).toHaveTextContent("Últimas 24 horasÚltimos 7 diasÚltimos 30 diasPeríodo personalizado");
    expect(within(dialog).queryByText("Últimos 12 meses")).not.toBeInTheDocument();
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

  it("shows Portuguese interval errors, disables Apply and skips the count preview", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderFilters({ yearFrom: 2026, yearTo: 2024, presentedStart: "2026-02-01", presentedEnd: "2026-01-01", activityStart: "2026-04-01", activityEnd: "2026-03-01" });
    const dialog = openDialog();

    expect(within(dialog).getByText("O ano inicial deve ser anterior ou igual ao ano final.")).toHaveRole("alert");
    expect(within(dialog).getByText("A data inicial de apresentação deve ser anterior ou igual à data final.")).toHaveRole("alert");
    expect(within(dialog).getByText("A data inicial de atividade deve ser anterior ou igual à data final.")).toHaveRole("alert");
    expect(within(dialog).getByRole("button", { name: /aplicar filtros/i })).toBeDisabled();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*\.advancedFilters \{ width: 100vw; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration/);
  });
});
