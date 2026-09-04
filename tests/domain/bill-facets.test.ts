import { describe, expect, it } from "vitest";
import { classifySimplifiedStage, classifyVoteResult, normalizeProposalType, parseProposalIdentity } from "#/domain/bill-facets";

describe("bill facets", () => {
  it.each([
    ["PEC 8/2025", { proposalType: "PEC", proposalNumber: 8, proposalYear: 2025 }],
    ["PLP nº 12, de 2024", { proposalType: "PLP", proposalNumber: 12, proposalYear: 2024 }],
    ["SBT-A 3/2026", { proposalType: "SBT-A", proposalNumber: 3, proposalYear: 2026 }],
    ["EMC-A 14/2025", { proposalType: "EMC-A", proposalNumber: 14, proposalYear: 2025 }],
    ["SBE-A 7/2024", { proposalType: "SBE-A", proposalNumber: 7, proposalYear: 2024 }],
    ["ATA_PRE 1/2025", { proposalType: "ATA_PRE", proposalNumber: 1, proposalYear: 2025 }],
    ["R.C 2/2026", { proposalType: "R.C", proposalNumber: 2, proposalYear: 2026 }],
    ["R.S 10/2024", { proposalType: "R.S", proposalNumber: 10, proposalYear: 2024 }],
    ["PRL 1/0", { proposalType: "PRL", proposalNumber: 1, proposalYear: null }],
    ["Texto sem identidade", { proposalType: null, proposalNumber: null, proposalYear: null }],
  ])("parses %s", (value, expected) => expect(parseProposalIdentity(value)).toEqual(expected));

  it.each([
    [" ata_pre ", "ATA_PRE"],
    ["r.c", "R.C"],
    ["R.S", "R.S"],
    ["TIPO/INTERNO", null],
    ["A__B", null],
    ["TIPO-", null],
    ["TIPO_COM_NOME_EXTENSO", null],
  ])("normalizes a bounded official type token %s", (value, expected) => {
    expect(normalizeProposalType(value)).toBe(expected);
  });

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
