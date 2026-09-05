// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicCandidateDetail } from "#/server/candidates/read-models";
import { CandidateAssets } from "#/ui/candidate-assets";
import { CandidateFinance } from "#/ui/candidate-finance";
import { CandidateHistory } from "#/ui/candidate-history";
import { CandidateProfile } from "#/ui/candidate-profile";

const routeMocks = vi.hoisted(() => ({
  getCandidateDetail: vi.fn(),
  notFound: vi.fn((): never => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("next/navigation.js", () => ({ notFound: routeMocks.notFound }));
vi.mock("#/server/db/client", () => ({ db: { kind: "candidate-profile-page-test-db" } }));
vi.mock("#/server/candidates/queries", () => ({ getCandidateDetail: routeMocks.getCandidateDetail }));

import CandidateProfilePage from "../../app/candidatos/[year]/[externalId]/page.tsx";

const checkedAt = "2026-09-05T12:00:00.000Z";
const extractedAt = "2026-09-05T11:00:00.000Z";

const detail = {
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
  coalition: "Coligação Cidadã",
  photoUrl: "/api/candidates/media/candidate/2026/260001234567/photo",
  sourceArchiveUrl: "https://cdn.tse.jus.br/consulta_cand_2026.zip",
  sourceExtractedAt: extractedAt,
  checkedAt,
  assetTotalCents: "0",
  assetCount: 1,
  finance: {
    revenueCents: "0",
    expenseCents: "150050",
    balanceCents: "-150050",
    revenueByCategory: { "Recursos públicos": "0" },
    expenseByCategory: { Publicidade: "150050" },
    sourceArchiveUrl: "https://cdn.tse.jus.br/prestacao_2026.zip",
    sourceExtractedAt: extractedAt,
    checkedAt,
  },
  hasPhoto: true,
  hasSocial: true,
  hasGovernmentPlan: true,
  hasCertificates: true,
  hasFinance: true,
  hasConfirmedLawmaker: true,
  projectCount: 11,
  voteCount: 11,
  seekingReelection: true,
  birthDate: "1980-01-01",
  ageAtInauguration: 46,
  gender: "FEMININO",
  race: "PARDA",
  education: "SUPERIOR COMPLETO",
  occupation: "PROFESSORA",
  maritalStatus: "SOLTEIRA",
  nationality: "BRASILEIRA NATA",
  birthRegion: "ES",
  birthCity: "VITÓRIA",
  officialUrl: "https://divulgacandcontas.tse.jus.br/candidato/260001234567",
  photoSource: {
    sourceArchiveUrl: "https://cdn.tse.jus.br/fotos.zip",
    sourceExtractedAt: null,
    checkedAt,
  },
  assets: [{
    category: "Veículo",
    description: "Bicicleta",
    valueCents: "0",
    sourceArchiveUrl: "https://cdn.tse.jus.br/bens.zip",
    sourceExtractedAt: extractedAt,
    checkedAt,
  }],
  assetCategories: [{ category: "Veículo", valueCents: "0", count: 1 }],
  socialLinks: [{
    label: "Instagram",
    url: "https://example.test/ana",
    sourceArchiveUrl: "https://cdn.tse.jus.br/redes.zip",
    sourceExtractedAt: extractedAt,
    checkedAt,
  }],
  documents: [{
    kind: "government_plan",
    label: "Proposta de governo",
    officialUrl: "https://cdn.tse.jus.br/plano.pdf",
    downloadUrl: "/api/candidates/media/government-plan/00000000-0000-4000-8000-000000000001",
    availableLocally: true,
    originalFilename: "plano.pdf",
    sourceArchiveUrl: "https://cdn.tse.jus.br/planos.zip",
    sourceExtractedAt: null,
    checkedAt,
  }, {
    kind: "certificate",
    label: "Certidão pública",
    officialUrl: "https://cdn.tse.jus.br/certidao.pdf",
    downloadUrl: "/api/candidates/media/certificate/00000000-0000-4000-8000-000000000002",
    availableLocally: true,
    originalFilename: "certidao.pdf",
    sourceArchiveUrl: "https://cdn.tse.jus.br/certidoes.zip",
    sourceExtractedAt: null,
    checkedAt,
  }],
  history: {
    lawmakers: [{
      source: "camara",
      externalId: "123",
      name: "Ana Maria Cidadã",
      electoralName: "Ana Cidadã",
      role: "deputado_federal",
      active: true,
      officialUrl: "https://www.camara.leg.br/deputados/123",
    }],
    projectCount: 11,
    primaryProjectCount: 10,
    coauthoredProjectCount: 2,
    voteCount: 11,
    topics: ["Educação", "Trabalho"],
    projects: {
      items: [{
        source: "camara",
        externalId: "501",
        officialCode: "PL 1/2026",
        officialTitle: "Trabalho digno",
        officialSummary: "",
        statusLabel: "Em análise",
        presentedAt: "2024-01-02T12:00:00.000Z",
        officialUrl: "https://www.camara.leg.br/propostas-legislativas/501",
        primary: true,
        coauthored: false,
      }],
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    },
    votes: {
      items: [{
        source: "camara",
        externalId: "vote-1",
        occurredAt: "2025-04-05T12:00:00.000Z",
        house: "camara",
        description: "Votação nominal",
        result: "Aprovado",
        choice: "sim",
        rawChoice: "Sim",
        officialUrl: "https://www.camara.leg.br/votacao/vote-1",
        bill: {
          source: "camara",
          externalId: "501",
          officialCode: "PL 1/2026",
          officialTitle: "Trabalho digno",
          officialUrl: "https://www.camara.leg.br/propostas-legislativas/501",
        },
      }],
      page: 3,
      pageSize: 10,
      total: 21,
      totalPages: 3,
    },
    voteDistribution: { sim: 8, nao: 2, abstencao: 1 },
    coverage: {
      projectFrom: "2024-01-02T12:00:00.000Z",
      projectTo: "2026-06-09T12:00:00.000Z",
      voteFrom: "2024-03-04T12:00:00.000Z",
      voteTo: "2026-07-09T12:00:00.000Z",
    },
  },
} satisfies PublicCandidateDetail;

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.getCandidateDetail.mockResolvedValue(detail);
});

describe("candidate analytical profile", () => {
  it("distinguishes zero finance from finance not published and keeps tables equivalent to charts", () => {
    const view = render(<CandidateFinance finance={detail.finance} />);

    expect(screen.getAllByText("R$ 0,00").length).toBeGreaterThan(0);
    expect(screen.getByRole("table", { name: "Composição da receita" })).toBeVisible();
    expect(screen.getByRole("table", { name: "Categorias de despesas" })).toBeVisible();
    expect(view.container.querySelector("[aria-hidden='true']")).toBeInTheDocument();

    view.rerender(<CandidateFinance finance={null} />);
    expect(screen.getByText(/Ainda não disponibilizado pelo TSE/)).toBeVisible();
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
  });

  it("keeps supplementary financial bars proportional to the tabular values", () => {
    const view = render(<CandidateFinance finance={{
      ...detail.finance!,
      revenueByCategory: { "Recursos públicos": "10000", "Recursos privados": "2500" },
    }} />);

    expect([...view.container.querySelectorAll(".candidateEvidenceTable:first-child .candidateBars span")]
      .map((bar) => (bar as HTMLElement).style.getPropertyValue("--candidate-bar")))
      .toEqual(["25%", "100%"]);
  });

  it("preserves a declared zero-value asset and explains a missing asset source", () => {
    const view = render(<CandidateAssets assets={detail.assets} categories={detail.assetCategories} totalCents="0" />);

    expect(screen.getAllByText("R$ 0,00").length).toBeGreaterThan(0);
    expect(screen.getByRole("table", { name: "Bens declarados ao TSE" })).toBeVisible();
    expect(screen.getByRole("table", { name: "Distribuição dos bens por categoria" })).toBeVisible();

    view.rerender(<CandidateAssets assets={[]} categories={[]} totalCents={null} />);
    expect(screen.getByText(/Ainda não disponibilizado pelo TSE/)).toBeVisible();
  });

  it("does not turn an unconfirmed link into lack of political experience", () => {
    render(<CandidateHistory basePath="/candidatos/2026/260001234567" history={null} />);

    expect(screen.getByText("Não existe histórico parlamentar confirmado para esta candidatura.")).toBeVisible();
    expect(screen.queryByText(/sem experiência/i)).not.toBeInTheDocument();
  });

  it("renders coverage, factual authorship, nominal choices and independent pagination", () => {
    render(<CandidateHistory basePath="/candidatos/2026/260001234567" history={detail.history} />);

    expect(screen.getByText(/cobertura baseada nos registros armazenados/i)).toBeVisible();
    expect(screen.getByText(/2 de jan. de 2024/i)).toBeVisible();
    expect(screen.getByText("Autoria principal")).toBeVisible();
    expect(within(screen.getByRole("table", { name: "Votos individuais oficiais" })).getByText("Sim")).toBeVisible();
    expect(screen.getByRole("table", { name: "Distribuição dos votos nominais" })).toBeVisible();
    expect([...screen.getByRole("table", { name: "Distribuição dos votos nominais" }).closest(".candidateVoteDistribution")!
      .querySelectorAll(".candidateBars span")].map((bar) => (bar as HTMLElement).style.getPropertyValue("--candidate-bar")))
      .toEqual(["100%", "25%", "12%"]);
    expect(screen.getByRole("link", { name: "Perfil oficial na Câmara dos Deputados" })).toHaveAttribute(
      "href", "https://www.camara.leg.br/deputados/123",
    );
    expect(screen.getByRole("link", { name: "Projetos anteriores" })).toHaveAttribute(
      "href", "/candidatos/2026/260001234567?votosPagina=3",
    );
    expect(screen.getByRole("link", { name: "Votos anteriores" })).toHaveAttribute(
      "href", "/candidatos/2026/260001234567?projetosPagina=2&votosPagina=2",
    );
  });

  it("renders every evidence section in reading order with explicit official sources", () => {
    const view = render(<CandidateProfile candidate={detail} />);
    const headings = within(view.container).getAllByRole("heading").map((heading) => heading.textContent);

    expect(headings).toEqual(expect.arrayContaining([
      "ANA CIDADÃ",
      "Dados declarados",
      "Proposta de governo",
      "Patrimônio declarado",
      "Financiamento de campanha",
      "Documentos e presença oficial",
      "Histórico parlamentar confirmado",
      "Proveniência dos dados",
    ]));
    expect(headings.indexOf("Dados declarados")).toBeLessThan(headings.indexOf("Proposta de governo"));
    expect(headings.indexOf("Proposta de governo")).toBeLessThan(headings.indexOf("Patrimônio declarado"));
    expect(screen.getByRole("link", { name: "Abrir candidatura no TSE" })).toHaveAttribute("href", detail.officialUrl);
    expect(screen.getByRole("link", { name: "Abrir proposta no TSE" })).toHaveAttribute("href", detail.documents[0]!.officialUrl);
    expect(screen.getByRole("link", { name: "Baixar cópia oficial da proposta" })).toHaveAttribute("href", detail.documents[0]!.downloadUrl);
    const provenance = screen.getByRole("heading", { name: "Proveniência dos dados" }).closest("section")!;
    expect(within(provenance).getByText("Foto oficial")).toBeVisible();
    expect(within(provenance).getByText("Redes sociais")).toBeVisible();
    expect(provenance).toHaveTextContent("Planos e certidões");
    expect(view.container).not.toHaveTextContent(/gerado por IA|ranking|melhor candidato/i);
  });

  it("replaces a failed official portrait with the neutral accessible fallback", () => {
    render(<CandidateProfile candidate={detail} />);

    fireEvent.error(screen.getByRole("img", { name: "Foto oficial de ANA CIDADÃ" }));

    expect(screen.queryByRole("img", { name: "Foto oficial de ANA CIDADÃ" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", {
      name: "Foto oficial não disponibilizada para ANA CIDADÃ",
    })).toBeVisible();
    expect(screen.getByText("Foto oficial ainda não disponibilizada pelo TSE")).toBeVisible();
  });

  it("explains every unavailable official block without converting absence to zero", () => {
    render(<CandidateProfile candidate={{
      ...detail,
      photoUrl: null,
      assetTotalCents: null,
      assetCount: 0,
      finance: null,
      assets: [],
      assetCategories: [],
      socialLinks: [],
      documents: [],
      history: null,
    }} />);

    expect(screen.getByLabelText("Foto oficial não disponibilizada para ANA CIDADÃ")).toBeVisible();
    expect(screen.getAllByText(/ainda não disponibilizad[oa] pelo TSE/i).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("Não existe histórico parlamentar confirmado para esta candidatura.")).toBeVisible();
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
  });
});

describe("candidate profile page", () => {
  it("validates route params and returns not found for malformed or absent candidates", async () => {
    await expect(CandidateProfilePage({
      params: Promise.resolve({ year: "2026x", externalId: "260001234567" }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(routeMocks.getCandidateDetail).not.toHaveBeenCalled();

    routeMocks.getCandidateDetail.mockResolvedValueOnce(null);
    await expect(CandidateProfilePage({
      params: Promise.resolve({ year: "2026", externalId: "260001234568" }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("parses independent page params and passes them to the detail query", async () => {
    render(await CandidateProfilePage({
      params: Promise.resolve({ year: "2026", externalId: "260001234567" }),
      searchParams: Promise.resolve({ projetosPagina: "2", votosPagina: "3" }),
    }));

    expect(routeMocks.getCandidateDetail).toHaveBeenCalledWith(
      expect.anything(),
      2026,
      "260001234567",
      { projectPage: 2, votePage: 3 },
    );
  });
});
