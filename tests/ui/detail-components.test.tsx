// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectTimeline } from "#/ui/project-timeline";
import { VoteEventCard } from "#/ui/vote-event";

afterEach(cleanup);

describe("project detail components", () => {
  it("opens a plain-language timeline that marks only the latest movement as current", () => {
    render(<ProjectTimeline items={[
      {
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
    expect(screen.getAllByText("Quem participou")).toHaveLength(2);
    expect(screen.getByText("Messias Donato")).toBeInTheDocument();
    expect(screen.getByText("Autoria do projeto · UNIÃO · ES")).toBeInTheDocument();
    expect(screen.getByText("General Girão")).toBeInTheDocument();
    expect(screen.getByText("Relatoria · PL · RN")).toBeInTheDocument();
    expect(screen.queryByText(/Apresentação do PL n\. 1928\/2026/)).not.toBeInTheDocument();
  });

  it("reveals every official timeline fact and source in the detailed view", () => {
    render(<ProjectTimeline items={[{
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
    expect(screen.getByText("General Girão")).toBeInTheDocument();
    expect(screen.getByText("Relatoria · PL · RN")).toBeInTheDocument();
    expect(screen.getByText("Registro oficial")).toHaveAttribute("href", "https://example.com/m1");
  });

  it("uses a neutral fallback when a movement cannot be simplified safely", () => {
    render(<ProjectTimeline items={[{
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
    expect(screen.getByText("Nenhuma pessoa foi mencionada individualmente neste registro.")).toBeInTheDocument();
  });

  it("points vote movements to the dedicated individual-votes section", () => {
    render(<ProjectTimeline items={[{
      externalId: "m1",
      occurredAt: "2026-08-30T14:00:00.000Z",
      sequence: 1,
      house: "camara",
      bodyName: "Plenário",
      statusLabel: "Votação concluída",
      description: "Votação nominal do projeto.",
      officialUrl: "https://example.com/m1",
    }]} />);

    expect(screen.getByRole("link", { name: "Ver votos individuais" })).toHaveAttribute("href", "#votacoes");
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
