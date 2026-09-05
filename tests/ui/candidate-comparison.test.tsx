// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PublicCandidateCard,
  PublicCandidateComparisonCandidate,
} from "#/server/candidates/read-models";
import { CandidateComparePicker } from "#/ui/candidate-compare-picker";
import { CandidateComparison } from "#/ui/candidate-comparison";

const routeMocks = vi.hoisted(() => ({
  compareCandidates: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock("next/navigation.js", () => ({ useRouter: () => ({ replace: routeMocks.routerReplace }) }));
vi.mock("#/server/db/client", () => ({ db: { kind: "candidate-comparison-page-test-db" } }));
vi.mock("#/server/candidates/queries", () => ({ compareCandidates: routeMocks.compareCandidates }));

import CandidateComparisonPage, { dynamic } from "../../app/candidatos/comparar/page.tsx";

const checkedAt = "2026-09-05T12:00:00.000Z";
const extractedAt = "2026-09-05T11:00:00.000Z";

function card(externalId: string, overrides: Partial<PublicCandidateCard> = {}): PublicCandidateCard {
  return {
    electionYear: 2026,
    externalId,
    fullName: `Pessoa ${externalId}`,
    ballotName: `Candidatura ${externalId}`,
    socialName: null,
    number: Number(externalId),
    office: "deputado_federal",
    round: 1,
    region: "ES",
    electoralUnit: "ESPÍRITO SANTO",
    status: "APTO",
    statusDetail: null,
    partyAcronym: "ABC",
    partyNumber: 10,
    partyName: "Partido ABC",
    federation: null,
    coalition: null,
    photoUrl: null,
    sourceArchiveUrl: "https://cdn.tse.jus.br/candidates.zip",
    sourceExtractedAt: extractedAt,
    checkedAt,
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
    ...overrides,
  };
}

const ana: PublicCandidateComparisonCandidate = {
  electionYear: 2026,
  externalId: "1010",
  ballotName: "Ana Cidadã",
  fullName: "Ana Maria Cidadã",
  number: 1010,
  office: "deputado_federal",
  region: "ES",
  electoralUnit: "ESPÍRITO SANTO",
  partyAcronym: "ABC",
  partyName: "Partido ABC",
  status: "APTO",
  officialUrl: "https://divulgacandcontas.tse.jus.br/candidato/1010",
  profileUrl: "/candidatos/2026/1010",
  history: {
    projectCount: 1,
    primaryProjectCount: 1,
    coauthoredProjectCount: 0,
    voteCount: 1,
    projects: {
      items: [{
        source: "camara",
        externalId: "bill-1",
        officialCode: "PL 1/2026",
        proposalType: "PL",
        proposalNumber: 1,
        proposalYear: 2026,
        officialTitle: "Trabalho digno",
        topics: ["Trabalho"],
        presentedAt: "2025-02-03T12:00:00.000Z",
        chamber: "camara",
        statusLabel: "Em análise",
        officialUrl: "https://www.camara.leg.br/propostas-legislativas/bill-1",
        primary: true,
        coauthored: false,
      }],
      total: 1,
      limit: 10,
      truncated: false,
    },
    votes: {
      items: [{
        source: "camara",
        externalId: "vote-1",
        occurredAt: "2025-04-05T12:00:00.000Z",
        house: "camara",
        description: "Votação nominal do PL 1/2026",
        result: "Aprovado",
        choice: "sim",
        rawChoice: "Sim",
        officialUrl: "https://www.camara.leg.br/votacao/vote-1",
        bill: {
          source: "camara",
          externalId: "bill-1",
          officialCode: "PL 1/2026",
          officialTitle: "Trabalho digno",
          officialUrl: "https://www.camara.leg.br/propostas-legislativas/bill-1",
        },
      }],
      total: 1,
      limit: 10,
      truncated: false,
    },
    coverage: {
      projectFrom: "2025-02-03T12:00:00.000Z",
      projectTo: "2025-02-03T12:00:00.000Z",
      voteFrom: "2025-04-05T12:00:00.000Z",
      voteTo: "2025-04-05T12:00:00.000Z",
    },
  },
};

const duda: PublicCandidateComparisonCandidate = {
  ...ana,
  externalId: "4040",
  ballotName: "Duda Popular",
  fullName: "Eduarda Popular",
  number: 4040,
  partyAcronym: "XYZ",
  partyName: "Partido XYZ",
  officialUrl: "https://divulgacandcontas.tse.jus.br/candidato/4040",
  profileUrl: "/candidatos/2026/4040",
  history: null,
};

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.compareCandidates.mockResolvedValue({ candidates: [duda, ana] });
});

describe("candidate comparison selection", () => {
  it("keeps a visible tray, preserves selection order and explains disabled incompatible cards", () => {
    render(<CandidateComparePicker candidates={[
      card("1010", { ballotName: "Ana Cidadã" }),
      card("2020", {
        ballotName: "Bia Senadora",
        office: "senador",
        electoralUnit: "SÃO PAULO",
        region: "SP",
      }),
      card("4040", { ballotName: "Duda Popular" }),
    ]} />);

    const tray = screen.getByRole("region", { name: "Seleção para comparação" });
    expect(within(tray).getByText("Nenhuma candidatura selecionada")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Adicionar Ana Cidadã à comparação" }));

    const incompatible = screen.getByRole("button", { name: "Adicionar Bia Senadora à comparação" });
    expect(incompatible).toBeDisabled();
    expect(incompatible).toHaveAccessibleDescription(/mesmo cargo e circunscrição/i);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar Duda Popular à comparação" }));

    expect(within(tray).getAllByRole("listitem").map((item) => item.textContent))
      .toEqual([expect.stringContaining("Ana Cidadã"), expect.stringContaining("Duda Popular")]);
    expect(within(tray).getByRole("link", { name: "Comparar 2 candidaturas" }))
      .toHaveAttribute("href", "/candidatos/comparar?ano=2026&id=1010&id=4040");

    fireEvent.click(within(tray).getByRole("button", { name: "Remover Ana Cidadã da comparação" }));
    expect(within(tray).getAllByRole("listitem")).toHaveLength(1);
    expect(within(tray).getByText("Duda Popular")).toBeVisible();
  });

  it("enforces the three-candidate limit in the picker without hiding compatible choices", () => {
    render(<CandidateComparePicker candidates={["1010", "2020", "3030", "4040"].map((id) => card(id))} />);

    for (const id of ["1010", "2020", "3030"]) {
      fireEvent.click(screen.getByRole("button", { name: `Adicionar Candidatura ${id} à comparação` }));
    }

    const fourth = screen.getByRole("button", { name: "Adicionar Candidatura 4040 à comparação" });
    expect(fourth).toBeDisabled();
    expect(fourth).toHaveAccessibleDescription(/limite de três/i);
    expect(screen.getByText("Candidatura 4040")).toBeVisible();
  });

  it("restores off-page selections from the catalog URL and writes every change back in order", () => {
    render(<CandidateComparePicker
      candidates={[card("1010", { ballotName: "Ana Cidadã" })]}
      catalogHref="/candidatos?uf=ES&pagina=2"
      initialCandidates={[duda]}
    />);

    const tray = screen.getByRole("region", { name: "Seleção para comparação" });
    expect(within(tray).getByText("Duda Popular")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Adicionar Ana Cidadã à comparação" }));

    expect(routeMocks.routerReplace).toHaveBeenCalledWith(
      "/candidatos?uf=ES&pagina=2&compararAno=2026&compararId=4040&compararId=1010",
    );
    expect(within(tray).getByRole("link", { name: "Comparar 2 candidaturas" }))
      .toHaveAttribute("href", "/candidatos/comparar?ano=2026&id=4040&id=1010");
  });
});

describe("neutral candidate comparison", () => {
  it("renders identity and only project/vote evidence in selected order with official links", () => {
    const view = render(<CandidateComparison result={{ candidates: [duda, ana] }} selectedIds={["4040", "1010"]} year={2026} />);

    const identity = screen.getByRole("table", { name: "Identidade eleitoral comparada" });
    expect(within(identity).getAllByRole("columnheader").map((cell) => cell.textContent))
      .toEqual(["Campo", "Duda Popular", "Ana Cidadã"]);
    expect(within(identity).getAllByText("ESPÍRITO SANTO")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Projetos propostos ou coautorados" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Como votou" })).toBeVisible();
    expect(screen.getByText(/^Autoria principal/)).toBeVisible();
    expect(screen.getByText(/Resultado geral: Aprovado/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Abrir PL 1/2026 na Câmara dos Deputados" }))
      .toHaveAttribute("href", "https://www.camara.leg.br/propostas-legislativas/bill-1");
    expect(screen.getByRole("link", { name: "Abrir registro oficial da votação na Câmara dos Deputados" }))
      .toHaveAttribute("href", "https://www.camara.leg.br/votacao/vote-1");
    expect(screen.getAllByText("Não há histórico parlamentar confirmado")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Alterar seleção no catálogo" }))
      .toHaveAttribute("href", "/candidatos?compararAno=2026&compararId=4040&compararId=1010");
    expect(view.container).not.toHaveTextContent(/patrimônio|finan(ças|ciamento)|certid|redes sociais|proposta de governo|perfil declarado/i);
    expect(view.container).not.toHaveTextContent(/pontuação|ranking|recomenda|vencedor|melhor candidat/i);
  });

  it("labels bounded evidence and exposes complete profiles without claiming a complete career", () => {
    render(<CandidateComparison
      result={{
        candidates: [{
          ...ana,
          history: {
            ...ana.history!,
            projectCount: 12,
            projects: { ...ana.history!.projects, total: 12, truncated: true },
          },
        }],
      }}
      selectedIds={["1010"]}
      year={2026}
    />);

    expect(screen.getByText(/1 de 12 projetos armazenados/i)).toBeVisible();
    expect(screen.getByText(/recorte dos registros oficiais armazenados/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver todos os registros de Ana Cidadã" }))
      .toHaveAttribute("href", "/candidatos/2026/1010");
  });

  it("renders useful empty, missing and incompatible states with removable selections", () => {
    const view = render(<CandidateComparison result={{ candidates: [] }} selectedIds={[]} year={2026} />);
    expect(screen.getByText("Escolha de uma a três candidaturas no catálogo.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Escolher candidaturas" })).toHaveAttribute("href", "/candidatos");

    view.rerender(<CandidateComparison
      result={{ error: "INCOMPATIBLE_CANDIDATES" }}
      selectedIds={["1010", "2020"]}
      year={2026}
    />);
    expect(screen.getByText(/disputar o mesmo cargo e a mesma circunscrição/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Remover candidatura 1010" }))
      .toHaveAttribute("href", "/candidatos/comparar?ano=2026&id=2020");

    view.rerender(<CandidateComparison
      result={{ error: "CANDIDATES_NOT_FOUND" }}
      selectedIds={["1010", "9999"]}
      year={2026}
    />);
    expect(screen.getByText(/retrato oficial atual/i)).toBeVisible();
    expect(view.container).not.toHaveTextContent("Ana Cidadã");
  });

  it("lets an over-limit URL recover one removal at a time without losing order", () => {
    render(<CandidateComparison
      result={{ error: "TOO_MANY_CANDIDATES" }}
      selectedIds={["1010", "2020", "3030", "4040", "5050"]}
      year={2026}
    />);

    expect(screen.getByText(/no máximo três candidaturas/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Remover candidatura 2020" }))
      .toHaveAttribute("href", "/candidatos/comparar?ano=2026&id=1010&id=3030&id=4040&id=5050");
  });

  it("provides stacked candidate sections for narrow screens without replacing semantic identity", () => {
    const view = render(<CandidateComparison result={{ candidates: [duda, ana] }} selectedIds={["4040", "1010"]} year={2026} />);

    expect(screen.getByRole("table", { name: "Identidade eleitoral comparada" })).toBeVisible();
    const stacked = view.container.querySelector(".candidateComparison__mobile");
    expect(stacked).toBeInTheDocument();
    expect(within(stacked as HTMLElement).getAllByRole("article").map((item) => item.getAttribute("aria-label")))
      .toEqual(["Identidade de Duda Popular", "Identidade de Ana Cidadã"]);
  });
});

describe("candidate comparison route", () => {
  it("reads promised repeated search params and keeps their order at the server boundary", async () => {
    expect(dynamic).toBe("force-dynamic");

    render(await CandidateComparisonPage({ searchParams: Promise.resolve({
      ano: "2026",
      id: ["4040", "1010", "4040"],
    }) }));

    expect(routeMocks.compareCandidates).toHaveBeenCalledWith(
      expect.anything(),
      2026,
      ["4040", "1010"],
    );
    const identity = screen.getByRole("table", { name: "Identidade eleitoral comparada" });
    expect(within(identity).getAllByRole("columnheader").map((cell) => cell.textContent))
      .toEqual(["Campo", "Duda Popular", "Ana Cidadã"]);
  });

  it("does not query or partially render malformed URL selections", async () => {
    render(await CandidateComparisonPage({ searchParams: Promise.resolve({
      ano: "2026",
      id: ["1010", "../9999"],
    }) }));

    expect(routeMocks.compareCandidates).not.toHaveBeenCalled();
    expect(screen.getByText(/retrato oficial atual/i)).toBeVisible();
  });
});
