import { describe, expect, it } from "vitest";
import { classifySimplifiedStage, classifyVoteResult, parseProposalIdentity } from "#/domain/bill-facets";

describe("bill facets", () => {
  it.each([
    ["PEC 8/2025", { proposalType: "PEC", proposalNumber: 8, proposalYear: 2025 }],
    ["PLP nº 12, de 2024", { proposalType: "PLP", proposalNumber: 12, proposalYear: 2024 }],
    ["Texto sem identidade", { proposalType: null, proposalNumber: null, proposalYear: null }],
  ])("parses %s", (value, expected) => expect(parseProposalIdentity(value)).toEqual(expected));

  it.each([
    ["Aguardando parecer na comissão", "committees"],
    ["Pronta para pauta", "ready_for_vote"],
    ["Transformada em norma jurídica", "closed"],
    ["Retirada de pauta", "unclassified"],
    ["Situação inédita", "unclassified"],
  ])("classifies stage %s", (value, expected) => expect(classifySimplifiedStage(value)).toBe(expected));

  it.each([["Aprovado", "approved"], ["Rejeitada", "rejected"], ["Retirada de pauta", "other"], ["Não foram aprovados", "other"], ["Não foram rejeitados", "other"], [null, "unavailable"]])(
    "classifies vote result %s",
    (value, expected) => expect(classifyVoteResult(value)).toBe(expected),
  );
});
