// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicBillDetail } from "#/server/public/read-models";

const mocks = vi.hoisted(() => ({
  getPublicBill: vi.fn(),
  notFound: vi.fn((): never => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("next/navigation.js", () => ({ notFound: mocks.notFound }));
vi.mock("#/server/db/client", () => ({ db: { kind: "project-detail-test-db" } }));
vi.mock("#/server/public/queries", () => ({ getPublicBill: mocks.getPublicBill }));
vi.mock("#/ui/follow-button", () => ({ FollowButton: () => null }));
vi.mock("#/ui/project-timeline", () => ({ ProjectTimeline: () => null }));

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
} satisfies PublicBillDetail;

describe("project detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicBill.mockResolvedValue(project);
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
});
