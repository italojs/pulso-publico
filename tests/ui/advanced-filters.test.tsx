// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicBillFilters, PublicFilterOptions } from "#/server/public/read-models";
import { FeedFilters } from "#/ui/feed-filters";

const options = {
  sources: ["camara", "senado"],
  proposalTypes: ["PEC", "PL"],
  years: [2024, 2025, 2026],
  originHouses: [
    { value: "camara", label: "Câmara dos Deputados" },
    { value: "senado", label: "Senado Federal" },
  ],
  currentHouses: [
    { value: "camara", label: "Câmara dos Deputados" },
    { value: "senado", label: "Senado Federal" },
    { value: "nao_informada", label: "Não informada" },
  ],
  stages: [
    { value: "committees", label: "Em comissões" },
    { value: "ready_for_vote", label: "Pronto para votação" },
  ],
  statuses: ["Em análise", "Pronta para pauta"],
  voteKinds: [
    { value: "nominal", label: "Nominal" },
    { value: "non_nominal", label: "Não nominal" },
  ],
  voteResults: [
    { value: "approved", label: "Aprovada" },
    { value: "rejected", label: "Rejeitada" },
  ],
  voteHouses: [
    { value: "camara", label: "Câmara dos Deputados" },
    { value: "senado", label: "Senado Federal" },
  ],
  topics: ["Educação", "Trabalho e Emprego"],
  parties: ["ABC", "XYZ"],
  authors: ["Ana Cidadã", "Bruno Federal"],
  regions: [
    { value: "PE", label: "PE" },
    { value: "SP", label: "SP" },
    { value: "nao_informada", label: "Não informada" },
  ],
} satisfies PublicFilterOptions;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderFilters(filters: PublicBillFilters = {}) {
  return render(<FeedFilters filters={filters} options={options} />);
}

describe("advanced feed filters", () => {
  it("opens a named dialog, contains keyboard focus and restores the trigger on Escape", () => {
    renderFilters({ query: "jornada", sources: ["camara"], topics: ["Trabalho e Emprego"] });

    expect(screen.getByRole("group", { name: "Filtros rápidos" })).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /filtros avançados/i });
    expect(trigger).toHaveTextContent("3");
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: /filtros avançados/i });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("group", { name: "Identificação" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Tramitação" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Votações" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Autoria e representação" })).toBeInTheDocument();

    const close = within(dialog).getByRole("button", { name: "Fechar filtros avançados" });
    const apply = within(dialog).getByRole("button", { name: /aplicar filtros/i });
    expect(close).toHaveFocus();

    apply.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("serializes multi-values as repeated hidden inputs and gives each applied value a removable URL", () => {
    const view = renderFilters({
      proposalTypes: ["PEC", "PL"],
      sources: ["camara", "senado"],
      presentedStart: "2025-01-01",
      presentedEnd: "2025-12-31",
    });

    const types = [...view.container.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="tipo"]')];
    expect(types.map((input) => input.value)).toEqual(["PEC", "PL"]);
    expect(view.container.querySelectorAll('input[type="hidden"][name="fonte"]')).toHaveLength(1);

    expect(screen.getByRole("link", { name: "Remover tipo PEC" })).toHaveAttribute(
      "href",
      expect.stringContaining("tipo=PL"),
    );
    expect(screen.getByRole("link", { name: "Remover tipo PEC" })).not.toHaveAttribute(
      "href",
      expect.stringContaining("tipo=PEC"),
    );
    expect(screen.getByRole("link", { name: "Remover apresentação desde 01/01/2025" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Remover apresentação até 31/12/2025" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Limpar tudo" })).toHaveAttribute("href", "/");
  });

  it("turns a selected activity preset into one chip that clears both derived bounds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));
    renderFilters({ activityStart: "2026-08-06", activityEnd: "2026-09-04" });

    const preset = screen.getByRole("link", { name: "Remover atividade nos últimos 30 dias" });
    expect(preset).not.toHaveAttribute("href", expect.stringContaining("atividadeInicio"));
    expect(preset).not.toHaveAttribute("href", expect.stringContaining("atividadeFim"));
  });

  it("requests a preview after 300 ms and announces the latest valid count", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ total: 42 }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderFilters({ sources: ["camara"] });

    fireEvent.change(screen.getByRole("combobox", { name: "Casa legislativa" }), { target: { value: "senado" } });
    fireEvent.click(screen.getByRole("button", { name: /filtros avançados/i }));
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/filter-count", expect.objectContaining({
      body: JSON.stringify({ filters: { sources: ["senado"] }, anonymousBillKeys: [] }),
      method: "POST",
    }));
    expect(screen.getByRole("status")).toHaveTextContent("42 projetos encontrados");
  });

  it("aborts a stale request and keeps the last count when the replacement fails", async () => {
    vi.useFakeTimers();
    let requestNumber = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestNumber += 1;
      if (requestNumber === 1) {
        return Promise.resolve(new Response(JSON.stringify({ total: 18 }), { status: 200 }));
      }
      if (requestNumber === 2) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }
      return Promise.reject(new Error("network unavailable"));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderFilters();

    fireEvent.click(screen.getByRole("button", { name: /filtros avançados/i }));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole("status")).toHaveTextContent("18 projetos encontrados");

    fireEvent.click(screen.getByRole("checkbox", { name: "PEC" }));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    const staleSignal = fetchMock.mock.calls[1]?.[1]?.signal;
    expect(staleSignal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole("checkbox", { name: "PL" }));
    expect(staleSignal?.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível atualizar a contagem");
    expect(screen.getByRole("button", { name: "Ver 18 projetos" })).toBeInTheDocument();
  });
});
