// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectTimeline } from "#/ui/project-timeline";
import { VoteEventCard } from "#/ui/vote-event";

describe("project detail components", () => {
  it("shows every timeline fact as official and links its source", () => {
    render(<ProjectTimeline items={[{
      externalId: "m1",
      occurredAt: "2026-08-30T14:00:00.000Z",
      sequence: 1,
      house: "camara",
      bodyName: "Comissão de Trabalho",
      statusLabel: "Em análise",
      description: "Designado relator na comissão.",
      officialUrl: "https://example.com/m1",
    }]} />);

    expect(screen.getByText("Designado relator na comissão.")).toBeInTheDocument();
    expect(screen.getByText("Registro oficial")).toHaveAttribute("href", "https://example.com/m1");
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
