import { describe, expect, it } from "vitest";

import { detectAlertCandidates } from "#/alerts/detect-events";

const base = {
  billExternalId: "501",
  officialCode: "PEC 8/2025",
  priorStatusLabel: "Aguardando parecer",
  currentStatusLabel: "Pronta para pauta",
  checkedAt: "2026-09-03T12:00:00.000Z",
};

describe("alert event detection", () => {
  it("detects a confirmed status change", () => {
    expect(detectAlertCandidates({ ...base, movements: [], voteEvents: [] })).toEqual([
      expect.objectContaining({ type: "status_change", title: "Situação atualizada · PEC 8/2025" }),
    ]);
  });

  it.each([
    ["Incluído na Ordem do Dia para votação.", "vote_scheduled"],
    ["Matéria sancionada pela Presidência da República.", "sanction_or_veto"],
    ["A matéria foi arquivada.", "archived"],
    ["Transformada em norma jurídica e publicada.", "in_force"],
  ] as const)("classifies '%s' as %s", (description, type) => {
    const events = detectAlertCandidates({
      ...base,
      priorStatusLabel: base.currentStatusLabel,
      movements: [{ externalId: "move-1", occurredAt: base.checkedAt, officialDescription: description, officialUrl: "https://example.com/move" }],
      voteEvents: [],
    });
    expect(events).toEqual([expect.objectContaining({ type })]);
  });

  it("detects a published vote result", () => {
    const events = detectAlertCandidates({
      ...base,
      priorStatusLabel: base.currentStatusLabel,
      movements: [],
      voteEvents: [{ externalId: "vote-1", occurredAt: base.checkedAt, description: "Votação do parecer", result: "Aprovado", officialUrl: "https://example.com/vote" }],
    });
    expect(events).toEqual([expect.objectContaining({ type: "vote_result", officialDescription: expect.stringContaining("Aprovado") })]);
  });

  it("ignores ordinary administrative movements", () => {
    const events = detectAlertCandidates({
      ...base,
      priorStatusLabel: base.currentStatusLabel,
      movements: [{ externalId: "move-2", occurredAt: base.checkedAt, officialDescription: "Recebido ofício e juntado aos autos.", officialUrl: "https://example.com/move" }],
      voteEvents: [],
    });
    expect(events).toEqual([]);
  });
});
