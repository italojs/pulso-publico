import { describe, expect, it } from "vitest";

import {
  manageCandidateLink,
  parseCandidateLinkCommand,
  reconcileCandidateLawmakers,
} from "#/jobs/reconcile-candidate-lawmakers";

const candidate = {
  externalId: "260001234567",
  fullName: "ANA CIDADÃ",
  office: "deputado_federal" as const,
  region: "ES",
  partyAcronym: "ABC",
};

const lawmaker = {
  id: "law-1",
  source: "camara" as const,
  externalId: "220530",
  name: "Ana Cidada",
  electoralName: "ANA CIDADÃ",
  role: "deputado_federal" as const,
  party: "abc",
  region: "ES",
};

describe("reconcileCandidateLawmakers", () => {
  it("creates only a pending suggestion for exact normalized name, UF, party and compatible office", () => {
    expect(reconcileCandidateLawmakers([candidate], [lawmaker])).toEqual([{
      candidateExternalId: candidate.externalId,
      lawmakerExternalId: lawmaker.externalId,
      lawmakerSource: "camara",
      status: "pending",
      method: "exact_name_region_party_office",
    }]);
  });

  it("does not suggest ambiguous or partially matching identities", () => {
    expect(reconcileCandidateLawmakers([candidate], [
      lawmaker,
      { ...lawmaker, id: "law-2", externalId: "220531" },
    ])).toEqual([]);
    expect(reconcileCandidateLawmakers([candidate], [
      { ...lawmaker, party: "XYZ" },
    ])).toEqual([]);
    expect(reconcileCandidateLawmakers([candidate], [
      { ...lawmaker, role: "senador", source: "senado" },
    ])).toEqual([]);
  });
});

describe("candidate link operator command", () => {
  it("parses a strict non-interactive command with official evidence", () => {
    expect(parseCandidateLinkCommand([
      "confirm",
      "--year=2026",
      `--candidate=${candidate.externalId}`,
      "--source=camara",
      "--lawmaker=220530",
      "--evidence=https://dadosabertos.camara.leg.br/api/v2/deputados/220530",
    ])).toEqual({
      action: "confirm",
      year: 2026,
      candidateExternalId: candidate.externalId,
      lawmakerSource: "camara",
      lawmakerExternalId: "220530",
      evidenceUrl: "https://dadosabertos.camara.leg.br/api/v2/deputados/220530",
    });
  });

  it("rejects duplicate, unknown, unsupported-year and nonofficial evidence arguments", () => {
    const base = [
      "reject",
      "--year=2026",
      `--candidate=${candidate.externalId}`,
      "--source=camara",
      "--lawmaker=220530",
      "--evidence=https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
    ];
    expect(() => parseCandidateLinkCommand([...base, "--year=2026"])).toThrow("INVALID_ARGUMENTS");
    expect(() => parseCandidateLinkCommand([...base, "--extra=value"])).toThrow("INVALID_ARGUMENTS");
    expect(() => parseCandidateLinkCommand(base.map((arg) => arg === "--year=2026" ? "--year=2030" : arg)))
      .toThrow("UNSUPPORTED_ELECTION_YEAR");
    expect(() => parseCandidateLinkCommand(base.map((arg) => arg.startsWith("--evidence=") ? "--evidence=https://example.org/prova" : arg)))
      .toThrow("INVALID_EVIDENCE_URL");
  });

  it("requires an existing candidate and lawmaker, then records an operator-reviewed result", async () => {
    const calls: Array<{ name: string; args: unknown[] }> = [];
    const repository = {
      async findCandidate() { return { id: "candidate-db-id" }; },
      async findLawmaker() { return { id: "lawmaker-db-id" }; },
      async createPendingLawmakerLink(...args: unknown[]) { calls.push({ name: "pending", args }); },
      async confirmLawmakerLink(...args: unknown[]) { calls.push({ name: "confirm", args }); },
      async rejectLawmakerLink(...args: unknown[]) { calls.push({ name: "reject", args }); },
    };
    const command = parseCandidateLinkCommand([
      "confirm", "--year=2026", `--candidate=${candidate.externalId}`,
      "--source=camara", "--lawmaker=220530",
      "--evidence=https://dadosabertos.camara.leg.br/api/v2/deputados/220530",
    ]);
    const reviewedAt = new Date("2026-09-05T13:00:00.000Z");

    const result = await manageCandidateLink(repository, command, () => reviewedAt);

    expect(result).toEqual({
      status: "confirmed",
      electionYear: 2026,
      candidateExternalId: candidate.externalId,
      lawmakerSource: "camara",
      lawmakerExternalId: "220530",
      reviewedAt: reviewedAt.toISOString(),
    });
    expect(calls).toEqual([
      { name: "pending", args: ["candidate-db-id", "lawmaker-db-id", "operator_review"] },
      {
        name: "confirm",
        args: ["candidate-db-id", "lawmaker-db-id", command.evidenceUrl, reviewedAt],
      },
    ]);
  });

  it("refuses review when either public identity does not exist", async () => {
    const command = parseCandidateLinkCommand([
      "reject", "--year=2026", `--candidate=${candidate.externalId}`,
      "--source=senado", "--lawmaker=8101",
      "--evidence=https://www.senado.leg.br/senadores/8101",
    ]);
    const repository = {
      async findCandidate() { return null; },
      async findLawmaker() { return null; },
      async createPendingLawmakerLink() {},
      async confirmLawmakerLink() {},
      async rejectLawmakerLink() {},
    };

    await expect(manageCandidateLink(repository, command)).rejects.toThrow("CANDIDATE_NOT_FOUND");
  });
});
