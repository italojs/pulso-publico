import type { CandidateOffice } from "#/domain/electoral";

export interface ReconciliationCandidate {
  externalId: string;
  fullName: string;
  office: CandidateOffice;
  region: string;
  partyAcronym: string;
}

export interface ReconciliationLawmaker {
  id: string;
  source: "camara" | "senado";
  externalId: string;
  name: string;
  electoralName: string;
  role: "deputado_federal" | "senador";
  party: string | null;
  region: string | null;
}

export interface CandidateLawmakerSuggestion {
  candidateExternalId: string;
  lawmakerExternalId: string;
  lawmakerSource: "camara" | "senado";
  status: "pending";
  method: "exact_name_region_party_office";
}

export interface CandidateLinkCommand {
  action: "confirm" | "reject";
  year: 2026;
  candidateExternalId: string;
  lawmakerSource: "camara" | "senado";
  lawmakerExternalId: string;
  evidenceUrl: string;
}

interface CandidateLinkRepository {
  findCandidate(electionYear: number, externalId: string): Promise<{ id: string } | null>;
  findLawmaker(
    source: "camara" | "senado",
    externalId: string,
  ): Promise<{ id: string } | null>;
  createPendingLawmakerLink(candidateId: string, lawmakerId: string, method: string): Promise<void>;
  confirmLawmakerLink(
    candidateId: string,
    lawmakerId: string,
    evidenceUrl: string,
    reviewedAt: Date,
  ): Promise<void>;
  rejectLawmakerLink(
    candidateId: string,
    lawmakerId: string,
    evidenceUrl: string,
    reviewedAt: Date,
  ): Promise<void>;
}

function normalizeIdentity(value: string): string {
  return value.normalize("NFD")
    .replace(/\p{Mark}+/gu, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");
}

function expectedRole(office: CandidateOffice): ReconciliationLawmaker["role"] | null {
  if (office === "deputado_federal") return "deputado_federal";
  if (office === "senador") return "senador";
  return null;
}

function identityMatches(
  candidate: ReconciliationCandidate,
  lawmaker: ReconciliationLawmaker,
): boolean {
  const role = expectedRole(candidate.office);
  if (!role || lawmaker.role !== role) return false;
  if (role === "deputado_federal" && lawmaker.source !== "camara") return false;
  if (role === "senador" && lawmaker.source !== "senado") return false;
  if (!lawmaker.party || !lawmaker.region) return false;
  if (normalizeIdentity(candidate.partyAcronym) !== normalizeIdentity(lawmaker.party)) return false;
  if (normalizeIdentity(candidate.region) !== normalizeIdentity(lawmaker.region)) return false;
  const candidateName = normalizeIdentity(candidate.fullName);
  return candidateName === normalizeIdentity(lawmaker.name)
    || candidateName === normalizeIdentity(lawmaker.electoralName);
}

function reconciliationKey(
  role: ReconciliationLawmaker["role"],
  region: string,
  party: string,
  name: string,
): string {
  return [role, normalizeIdentity(region), normalizeIdentity(party), normalizeIdentity(name)].join("|");
}

export function reconcileCandidateLawmakers(
  candidates: readonly ReconciliationCandidate[],
  lawmakers: readonly ReconciliationLawmaker[],
): CandidateLawmakerSuggestion[] {
  const lawmakersByKey = new Map<string, ReconciliationLawmaker[]>();
  for (const lawmaker of lawmakers) {
    if (!lawmaker.party || !lawmaker.region) continue;
    const names = new Set([normalizeIdentity(lawmaker.name), normalizeIdentity(lawmaker.electoralName)]);
    for (const name of names) {
      const key = reconciliationKey(lawmaker.role, lawmaker.region, lawmaker.party, name);
      lawmakersByKey.set(key, [...(lawmakersByKey.get(key) ?? []), lawmaker]);
    }
  }
  const uniqueMatches = candidates.flatMap((candidate) => {
    const role = expectedRole(candidate.office);
    if (!role) return [];
    const matches = lawmakersByKey.get(reconciliationKey(
      role,
      candidate.region,
      candidate.partyAcronym,
      candidate.fullName,
    ))?.filter((lawmaker) => identityMatches(candidate, lawmaker)) ?? [];
    return matches.length === 1 ? [{ candidate, lawmaker: matches[0]! }] : [];
  });
  const candidateCounts = new Map<string, number>();
  const lawmakerCounts = new Map<string, number>();
  for (const { candidate, lawmaker } of uniqueMatches) {
    candidateCounts.set(candidate.externalId, (candidateCounts.get(candidate.externalId) ?? 0) + 1);
    const lawmakerKey = `${lawmaker.source}:${lawmaker.externalId}`;
    lawmakerCounts.set(lawmakerKey, (lawmakerCounts.get(lawmakerKey) ?? 0) + 1);
  }

  return uniqueMatches.filter(({ candidate, lawmaker }) =>
    candidateCounts.get(candidate.externalId) === 1
    && lawmakerCounts.get(`${lawmaker.source}:${lawmaker.externalId}`) === 1
  ).map(({ candidate, lawmaker }) => ({
    candidateExternalId: candidate.externalId,
    lawmakerExternalId: lawmaker.externalId,
    lawmakerSource: lawmaker.source,
    status: "pending" as const,
    method: "exact_name_region_party_office" as const,
  }));
}

function assertEvidenceUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("INVALID_EVIDENCE_URL");
  }
  const hostname = parsed.hostname.toLocaleLowerCase("en-US");
  const allowed = ["tse.jus.br", "camara.leg.br", "senado.leg.br"];
  if (
    parsed.protocol !== "https:"
    || parsed.username.length > 0
    || parsed.password.length > 0
    || !allowed.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  ) {
    throw new Error("INVALID_EVIDENCE_URL");
  }
  return parsed.toString();
}

export function parseCandidateLinkCommand(args: readonly string[]): CandidateLinkCommand {
  const [action, ...rawOptions] = args;
  if (action !== "confirm" && action !== "reject") throw new Error("INVALID_ARGUMENTS");
  const allowed = new Set(["year", "candidate", "source", "lawmaker", "evidence"]);
  const options = new Map<string, string>();
  for (const rawOption of rawOptions) {
    const match = /^--([a-z]+)=(.+)$/.exec(rawOption);
    if (!match || !allowed.has(match[1]!) || options.has(match[1]!)) {
      throw new Error("INVALID_ARGUMENTS");
    }
    options.set(match[1]!, match[2]!);
  }
  if (options.size !== allowed.size) throw new Error("INVALID_ARGUMENTS");
  const year = options.get("year");
  if (year !== "2026") throw new Error("UNSUPPORTED_ELECTION_YEAR");
  const candidateExternalId = options.get("candidate")!;
  const lawmakerExternalId = options.get("lawmaker")!;
  const lawmakerSource = options.get("source");
  if (
    !/^\d{12}$/.test(candidateExternalId)
    || !/^\d+$/.test(lawmakerExternalId)
    || (lawmakerSource !== "camara" && lawmakerSource !== "senado")
  ) {
    throw new Error("INVALID_ARGUMENTS");
  }
  return {
    action,
    year: 2026,
    candidateExternalId,
    lawmakerSource,
    lawmakerExternalId,
    evidenceUrl: assertEvidenceUrl(options.get("evidence")!),
  };
}

export async function manageCandidateLink(
  repository: CandidateLinkRepository,
  command: CandidateLinkCommand,
  now: () => Date = () => new Date(),
) {
  const candidate = await repository.findCandidate(command.year, command.candidateExternalId);
  if (!candidate) throw new Error("CANDIDATE_NOT_FOUND");
  const lawmaker = await repository.findLawmaker(
    command.lawmakerSource,
    command.lawmakerExternalId,
  );
  if (!lawmaker) throw new Error("LAWMAKER_NOT_FOUND");
  const reviewedAt = now();
  await repository.createPendingLawmakerLink(candidate.id, lawmaker.id, "operator_review");
  if (command.action === "confirm") {
    await repository.confirmLawmakerLink(
      candidate.id,
      lawmaker.id,
      command.evidenceUrl,
      reviewedAt,
    );
  } else {
    await repository.rejectLawmakerLink(
      candidate.id,
      lawmaker.id,
      command.evidenceUrl,
      reviewedAt,
    );
  }
  return {
    status: command.action === "confirm" ? "confirmed" as const : "rejected" as const,
    electionYear: command.year,
    candidateExternalId: command.candidateExternalId,
    lawmakerSource: command.lawmakerSource,
    lawmakerExternalId: command.lawmakerExternalId,
    reviewedAt: reviewedAt.toISOString(),
  };
}
