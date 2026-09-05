// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieText: "",
  headers: vi.fn(),
  currentUser: vi.fn(),
  listCandidates: vi.fn(),
  listOptions: vi.fn(),
  redirect: vi.fn((target: string): never => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));

vi.mock("next/headers.js", () => ({
  cookies: async () => ({ toString: () => mocks.cookieText }),
  headers: mocks.headers,
}));
vi.mock("next/navigation.js", () => ({ redirect: mocks.redirect }));
vi.mock("#/auth/current-user", () => ({ currentUserFromCookie: mocks.currentUser }));
vi.mock("#/auth/user-repository", () => ({ UserRepository: class UserRepository {} }));
vi.mock("#/server/config", () => ({ env: { GEO_PROVIDER: "cloudflare" } }));
vi.mock("#/server/db/client", () => ({ db: { kind: "candidate-route-test-db" } }));
vi.mock("#/server/candidates/queries", () => ({
  listCandidates: mocks.listCandidates,
  listCandidateFilterOptions: mocks.listOptions,
}));

import CandidateCatalogPage, { dynamic } from "../../../app/candidatos/page.tsx";

const emptyPage = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 };
const emptyOptions = {
  snapshots: [], electionYears: [], offices: [], regions: [], parties: [], rounds: [], statuses: [],
  federations: [], coalitions: [], genders: [], races: [], educations: [], occupations: [],
  assetCategories: [], fundingKinds: [], lawmakerHouses: [], topics: [],
};

describe("candidate catalog route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieText = "";
    mocks.headers.mockResolvedValue(new Headers());
    mocks.currentUser.mockResolvedValue(null);
    mocks.listCandidates.mockResolvedValue(emptyPage);
    mocks.listOptions.mockResolvedValue(emptyOptions);
  });

  afterEach(cleanup);

  it("is always rendered dynamically", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("redirects an anonymous followed-only request with its complete canonical return URL", async () => {
    await expect(CandidateCatalogPage({ searchParams: Promise.resolve({
      acompanhando: "1",
      cargo: "senador",
      uf: ["ES", "SP"],
      pagina: "2",
    }) })).rejects.toThrow(
      "NEXT_REDIRECT:/entrar?next=%2Fcandidatos%3Fcargo%3Dsenador%26uf%3DES%26uf%3DSP%26acompanhando%3D1%26pagina%3D2",
    );

    expect(mocks.listCandidates).not.toHaveBeenCalled();
    expect(mocks.listOptions).not.toHaveBeenCalled();
  });

  it("scopes a followed-only request to the authenticated account", async () => {
    mocks.currentUser.mockResolvedValue({ id: "user-1" });

    render(await CandidateCatalogPage({ searchParams: Promise.resolve({
      acompanhando: "1",
      abrangencia: "brasil",
    }) }));

    expect(mocks.listCandidates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ followedOnly: true, allBrazil: true }),
      { userId: "user-1" },
    );
  });

  it("uses an explicit URL region instead of a provider-inferred region", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "cf-region-code": "SP" }));

    render(await CandidateCatalogPage({ searchParams: Promise.resolve({ uf: "ES" }) }));

    expect(mocks.listCandidates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ regions: ["ES"] }),
      {},
    );
    expect(screen.getByText("UF selecionada: ES")).toBeInTheDocument();
    expect(screen.queryByText(/UF estimada/)).not.toBeInTheDocument();
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it("applies a trusted inferred region only when coverage is otherwise unspecified", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "cf-region-code": " sp " }));

    render(await CandidateCatalogPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.listCandidates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ regions: ["SP"] }),
      {},
    );
    expect(screen.getByText("UF estimada: SP")).toBeInTheDocument();
  });

  it("keeps explicit all-Brazil coverage and suppresses provider inference", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "cf-region-code": "SP" }));

    render(await CandidateCatalogPage({ searchParams: Promise.resolve({ abrangencia: "brasil" }) }));

    expect(mocks.listCandidates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allBrazil: true }),
      {},
    );
    expect(mocks.listCandidates.mock.calls[0]?.[1]).not.toHaveProperty("regions");
    expect(screen.getByText("Abrangência: Brasil inteiro")).toBeInTheDocument();
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it("renders the no-snapshot state without suggesting that zero candidates were published", async () => {
    const view = render(await CandidateCatalogPage({ searchParams: Promise.resolve({ abrangencia: "brasil" }) }));

    expect(view.getByRole("heading", { name: "Conheça as candidaturas" })).toBeInTheDocument();
    expect(view.getByText(/Ainda não há um retrato eleitoral oficial disponível/)).toBeInTheDocument();
    expect(view.queryByText("0 candidaturas encontradas")).not.toBeInTheDocument();
  });

  it("renders official snapshot provenance, result count and candidate facts", async () => {
    mocks.currentUser.mockResolvedValue({ id: "user-1" });
    mocks.listOptions.mockResolvedValue({
      ...emptyOptions,
      snapshots: [{ electionYear: 2026, extractedAt: "2026-09-05T11:00:00.000Z" }],
    });
    mocks.listCandidates.mockResolvedValue({
      ...emptyPage,
      total: 1,
      items: [{
        electionYear: 2026,
        externalId: "260001",
        ballotName: "Ana Cidadã",
        fullName: "Ana Cidadã da Silva",
        socialName: null,
        number: 1234,
        office: "deputado_federal",
        round: 1,
        region: "ES",
        electoralUnit: "ESPÍRITO SANTO",
        partyAcronym: "ABC",
        partyNumber: 12,
        partyName: "Partido ABC",
        federation: null,
        coalition: null,
        status: "APTO",
        statusDetail: null,
        photoUrl: null,
        sourceArchiveUrl: "https://cdn.tse.jus.br/candidates.zip",
        sourceExtractedAt: "2026-09-05T11:00:00.000Z",
        checkedAt: "2026-09-05T12:00:00.000Z",
        assetTotalCents: null,
        assetCount: 0,
        finance: null,
        hasPhoto: false,
        hasSocial: false,
        hasGovernmentPlan: false,
        hasCertificates: false,
        hasFinance: false,
        hasConfirmedLawmaker: false,
        projectCount: 0,
        voteCount: 0,
      }],
    });

    const view = render(await CandidateCatalogPage({ searchParams: Promise.resolve({ uf: "ES" }) }));

    expect(view.container).toHaveTextContent("1 candidatura encontrada");
    expect(view.getByText("Ana Cidadã")).toBeInTheDocument();
    expect(view.getByText(/Número 1234 · Deputado federal · ES · ABC/)).toBeInTheDocument();
    expect(view.getByText("Retrato oficial do TSE")).toBeInTheDocument();
    expect(view.getByText("5 de set. de 2026, 08:00")).toBeInTheDocument();
  });
});
