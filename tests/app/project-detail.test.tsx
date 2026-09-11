// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicBillDetail } from "#/server/public/read-models";

const mocks = vi.hoisted(() => ({
  getPublicBill: vi.fn(),
  prepareProjectHistory: vi.fn(),
  notFound: vi.fn((): never => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("next/navigation.js", () => ({ notFound: mocks.notFound }));
vi.mock("#/server/db/client", () => ({ db: { kind: "project-detail-test-db" } }));
vi.mock("#/server/public/queries", () => ({ getPublicBill: mocks.getPublicBill }));
vi.mock("#/server/legislative/prepare-project-history", () => ({
  prepareProjectHistory: mocks.prepareProjectHistory,
}));
vi.mock("#/ui/follow-button", () => ({ FollowButton: () => null }));
vi.mock("#/ui/project-timeline", () => ({
  ProjectTimeline: ({ historyLoadStatus }: { historyLoadStatus: string }) => (
    <span data-testid="timeline-load-status">{historyLoadStatus}</span>
  ),
}));

import ProjectPage from "../../app/projetos/[source]/[externalId]/page.tsx";

const project = {
  source: "senado",
  externalId: "9105948",
  officialCode: "PLP 74/2026",
  officialTitle: "Projeto de Lei Complementar nº 74, de 2026",
  officialSummary: "Dispõe sobre regras relativas a benefícios tributários.",
  officialUrl: "https://example.com/project",
  statusLabel: "Aprovada",
  originHouse: "camara",
  currentHouse: "senado",
  presentedAt: "2026-03-23T20:21:00.000Z",
  checkedAt: "2026-09-03T23:36:00.000Z",
  latestActivityAt: "2026-09-03T23:12:00.000Z",
  topics: [],
  authors: [],
  timeline: [],
  voteEvents: [
    {
      externalId: "senado-newest",
      occurredAt: "2026-09-03T20:12:00.000Z",
      house: "senado",
      description: "Votação final no Senado",
      result: "Aprovado",
      isNominal: true,
      isSecret: false,
      officialUrl: "https://example.com/senado-newest",
      individualVotes: [],
    },
    {
      externalId: "camara-older",
      occurredAt: "2026-09-02T17:00:00.000Z",
      house: "camara",
      description: "Votação do texto na Câmara",
      result: "Aprovado",
      isNominal: true,
      isSecret: false,
      officialUrl: "https://example.com/camara-older",
      individualVotes: [],
    },
  ],
  historyLoadStatus: "complete",
} satisfies PublicBillDetail;

describe("project detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicBill.mockResolvedValue(project);
    mocks.prepareProjectHistory.mockResolvedValue({ status: "complete" });
  });

  afterEach(cleanup);

  it("separates bicameral votes into house sections with the newest house first", async () => {
    render(await ProjectPage({ params: Promise.resolve({ source: "senado", externalId: "9105948" }) }));

    expect(screen.getByText("2 votações relacionadas")).toBeInTheDocument();
    const houseSections = screen.getAllByRole("region", { name: /Votações n[oa]/ });
    expect(houseSections.map((section) => section.getAttribute("aria-label"))).toEqual([
      "Votações no Senado",
      "Votações na Câmara",
    ]);
    expect(within(houseSections[0]!).getByText("Votação final no Senado")).toBeInTheDocument();
    expect(within(houseSections[1]!).getByText("Votação do texto na Câmara")).toBeInTheDocument();
  });

  it("prepares official history before reading the project", async () => {
    render(await ProjectPage({ params: Promise.resolve({ source: "senado", externalId: "9105948" }) }));

    expect(mocks.prepareProjectHistory).toHaveBeenCalledWith("senado", "9105948");
    expect(mocks.prepareProjectHistory.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.getPublicBill.mock.invocationCallOrder[0]!);
  });

  it("shows a practical impact only when an AI summary provides one", async () => {
    mocks.getPublicBill.mockResolvedValue({
      ...project,
      practicalImpact: "Na prática: trabalhadores abrangidos passariam a ter uma escala com dois dias consecutivos de descanso, se o texto entrar em vigor.",
    });

    render(await ProjectPage({ params: Promise.resolve({ source: "senado", externalId: "9105948" }) }));

    expect(screen.getByRole("heading", { name: "O que muda na prática" })).toBeInTheDocument();
    expect(screen.getByText(/trabalhadores abrangidos passariam a ter uma escala/i)).toBeInTheDocument();
  });

  it("does not claim there are no votes while history is still pending", async () => {
    mocks.getPublicBill.mockResolvedValue({
      ...project,
      voteEvents: [],
      historyLoadStatus: "pending",
    });

    render(await ProjectPage({ params: Promise.resolve({ source: "senado", externalId: "9105948" }) }));

    expect(screen.getByText("O histórico detalhado ainda não foi carregado.")).toBeInTheDocument();
    expect(screen.queryByText(/não publicou votações/)).not.toBeInTheDocument();
  });

  it("keeps stored history visible and warns when the bicameral refresh is partial", async () => {
    mocks.prepareProjectHistory.mockResolvedValue({ status: "partial" });

    render(await ProjectPage({ params: Promise.resolve({ source: "senado", externalId: "9105948" }) }));

    expect(screen.getByText(/atualização do histórico completo ainda está pendente/i)).toBeInTheDocument();
    expect(screen.getByText("Votação final no Senado")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-load-status")).toHaveTextContent("pending");
  });

  it("states confirmed absence only after hydration completes", async () => {
    mocks.getPublicBill.mockResolvedValue({
      ...project,
      voteEvents: [],
      historyLoadStatus: "complete",
    });

    render(await ProjectPage({ params: Promise.resolve({ source: "senado", externalId: "9105948" }) }));

    expect(screen.getByText("A fonte oficial não publicou votações para esta matéria.")).toBeInTheDocument();
  });
});
