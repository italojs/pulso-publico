// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectTimeline } from "#/ui/project-timeline";
import { VoteEventCard } from "#/ui/vote-event";

afterEach(cleanup);

describe("project detail components", () => {
  it("opens a plain-language timeline that marks only the latest movement as current", () => {
    render(<ProjectTimeline items={[
      {
        source: "camara",
        externalId: "m1",
        occurredAt: "2026-04-22T19:23:00.000Z",
        sequence: 1,
        house: "camara",
        bodyName: "Mesa Diretora",
        statusLabel: "Aguardando Parecer",
        description: "Apresentação do PL n. 1928/2026, pelo Deputado Messias Donato (UNIÃO/ES).",
        officialUrl: "https://example.com/m1",
      },
      {
        source: "camara",
        externalId: "m2",
        occurredAt: "2026-09-03T19:36:00.000Z",
        sequence: 14,
        house: "camara",
        bodyName: "CSAUDE",
        statusLabel: "Aguardando Parecer",
        description: "Designado Relator, Dep. General Girão (PL-RN).",
        officialUrl: "https://example.com/m2",
      },
    ]} />);

    expect(screen.getByRole("tab", { name: "Visão simplificada" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Projeto apresentado")).toBeInTheDocument();
    expect(screen.getByText("Relator definido")).toBeInTheDocument();
    expect(screen.getByText("Concluída")).toBeInTheDocument();
    expect(screen.getByText("Etapa atual")).toBeInTheDocument();
    expect(screen.getByText(/agora, o relator precisa apresentar sua análise/i)).toBeInTheDocument();
    expect(screen.getAllByText("Órgão responsável")).toHaveLength(2);
    expect(screen.getByText("Comissão de Saúde")).toBeInTheDocument();
    expect(screen.queryByText("Quem participou")).not.toBeInTheDocument();
    expect(screen.queryByText("Autoria do projeto · UNIÃO · ES")).not.toBeInTheDocument();
    expect(screen.queryByText("Relatoria · PL · RN")).not.toBeInTheDocument();
    expect(screen.queryByText(/Apresentação do PL n\. 1928\/2026/)).not.toBeInTheDocument();
  });

  it("reveals every official timeline fact and source in the detailed view", () => {
    render(<ProjectTimeline items={[{
      source: "camara",
      externalId: "m1",
      occurredAt: "2026-08-30T14:00:00.000Z",
      sequence: 1,
      house: "camara",
      bodyName: "Comissão de Trabalho",
      statusLabel: "Aguardando Parecer",
      description: "Designado Relator, Dep. General Girão (PL-RN).",
      officialUrl: "https://example.com/m1",
    }]} />);

    fireEvent.click(screen.getByRole("tab", { name: "Visão detalhada" }));

    expect(screen.getByRole("tab", { name: "Visão detalhada" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Designado Relator, Dep. General Girão (PL-RN).")).toBeInTheDocument();
    expect(screen.getByText("Aguardando Parecer")).toBeInTheDocument();
    expect(screen.queryByText("Quem participou")).not.toBeInTheDocument();
    expect(screen.queryByText("Relatoria · PL · RN")).not.toBeInTheDocument();
    expect(screen.getByText("Registro oficial")).toHaveAttribute("href", "https://example.com/m1");
  });

  it("expands a known official body code instead of repeating a generic label", () => {
    render(<ProjectTimeline items={[{
      source: "camara",
      externalId: "m-plen",
      occurredAt: "2026-09-03T20:12:00.000Z",
      sequence: 1,
      house: "camara",
      bodyName: "PLEN",
      statusLabel: "Em votação",
      description: "Votação em turno único.",
      officialUrl: "https://example.com/m-plen",
    }]} />);

    expect(screen.getByText("Plenário da Câmara dos Deputados")).toBeInTheDocument();
    expect(screen.getAllByText("Órgão responsável")).toHaveLength(1);
  });

  it("preserves an unknown official body code instead of hiding it behind a generic name", () => {
    render(<ProjectTimeline items={[{
      source: "camara",
      externalId: "m-unknown-body",
      occurredAt: "2026-09-03T20:12:00.000Z",
      sequence: 1,
      house: "camara",
      bodyName: "ORG123",
      statusLabel: "Em análise",
      description: "Movimentação oficial.",
      officialUrl: "https://example.com/m-unknown-body",
    }]} />);

    expect(screen.getByText("Nome não disponível · código oficial ORG123")).toBeInTheDocument();
    expect(screen.getAllByText("Órgão responsável")).toHaveLength(1);
  });

  it("separates Câmara and Senado movements into clearly labeled sections", () => {
    render(<ProjectTimeline items={[
      {
        source: "camara",
        externalId: "camara-1",
        occurredAt: "2024-05-10T12:00:00.000Z",
        sequence: 1,
        house: "camara",
        bodyName: "Mesa Diretora",
        statusLabel: "Apresentado",
        description: "Projeto apresentado na Câmara dos Deputados.",
        officialUrl: "https://example.com/camara-1",
      },
      {
        source: "senado",
        externalId: "senado-1",
        occurredAt: "2026-08-20T10:00:00.000Z",
        sequence: 1,
        house: "senado",
        bodyName: "Plenário",
        statusLabel: "Em análise",
        description: "Projeto recebido pelo Senado Federal.",
        officialUrl: "https://example.com/senado-1",
      },
    ]} />);

    expect(screen.getByRole("region", { name: "Tramitação na Câmara" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tramitação no Senado" })).toBeInTheDocument();
  });

  it("shows the house and movements with the newest activity first", () => {
    render(<ProjectTimeline items={[
      {
        source: "camara",
        externalId: "camara-older",
        occurredAt: "2024-05-10T12:00:00.000Z",
        sequence: 1,
        house: "camara",
        bodyName: "Mesa Diretora",
        statusLabel: "Apresentado",
        description: "Projeto apresentado na Câmara dos Deputados.",
        officialUrl: "https://example.com/camara-older",
      },
      {
        source: "senado",
        externalId: "senado-older",
        occurredAt: "2026-08-20T10:00:00.000Z",
        sequence: 1,
        house: "senado",
        bodyName: "Plenário",
        statusLabel: "Recebido",
        description: "Projeto recebido pelo Senado Federal.",
        officialUrl: "https://example.com/senado-older",
      },
      {
        source: "senado",
        externalId: "senado-newest",
        occurredAt: "2026-09-03T20:12:00.000Z",
        sequence: 2,
        house: "senado",
        bodyName: "Plenário",
        statusLabel: "Aprovado",
        description: "Projeto levado a votação e aprovado no Senado Federal.",
        officialUrl: "https://example.com/senado-newest",
      },
    ]} />);

    const houseSections = screen.getAllByRole("region");
    expect(houseSections.map((section) => section.getAttribute("aria-label"))).toEqual([
      "Tramitação no Senado",
      "Tramitação na Câmara",
    ]);

    const senateMovements = within(houseSections[0]!).getAllByRole("listitem");
    expect(senateMovements[0]).toHaveTextContent("Projeto levado a votação");
    expect(senateMovements[1]).toHaveTextContent("Projeto recebido pelo órgão responsável");
  });

  it("uses a neutral fallback when a movement cannot be simplified safely", () => {
    render(<ProjectTimeline items={[{
      source: "senado",
      externalId: "m1",
      occurredAt: "2026-08-30T14:00:00.000Z",
      sequence: 1,
      house: "senado",
      bodyName: null,
      statusLabel: null,
      description: "Procedimento oficial sem classificação conhecida.",
      officialUrl: "https://example.com/m1",
    }]} />);

    expect(screen.getByText("Movimentação registrada")).toBeInTheDocument();
    expect(screen.getByText(/fonte oficial registrou uma atualização/i)).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma pessoa foi mencionada individualmente neste registro.")).not.toBeInTheDocument();
  });

  it("does not infer individual votes when a vote was secret", () => {
    render(<VoteEventCard event={{
      externalId: "v1",
      occurredAt: "2026-08-31T18:00:00.000Z",
      house: "senado",
      description: "Votação final",
      result: "Aprovado",
      isNominal: false,
      isSecret: true,
      officialUrl: "https://example.com/v1",
      individualVotes: [],
    }} />);

    expect(screen.getByText(/votação foi secreta/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders nominal public votes with their raw official choice", () => {
    render(<VoteEventCard event={{
      externalId: "v2",
      occurredAt: "2026-08-31T18:00:00.000Z",
      house: "camara",
      description: "Votação do parecer",
      result: "Aprovado",
      isNominal: true,
      isSecret: false,
      officialUrl: "https://example.com/v2",
      individualVotes: [{
        lawmakerExternalId: "100",
        lawmakerName: "Ana Cidadã",
        party: "ABC",
        region: "PE",
        choice: "sim",
        rawChoice: "Sim",
        officialUrl: "https://example.com/v2",
      }],
    }} />);

    expect(screen.getByRole("table", { name: "Votos individuais" })).toBeInTheDocument();
    expect(screen.getByText("Ana Cidadã")).toBeInTheDocument();
    expect(screen.getByText("Sim")).toBeInTheDocument();
  });
});
