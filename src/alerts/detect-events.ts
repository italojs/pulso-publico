export type AlertType =
  | "status_change"
  | "vote_scheduled"
  | "vote_result"
  | "sanction_or_veto"
  | "archived"
  | "in_force";

export interface AlertCandidate {
  type: AlertType;
  dedupeKey: string;
  occurredAt: string;
  title: string;
  officialDescription: string;
  officialUrl: string;
}

interface RelevantMovement {
  externalId: string;
  occurredAt: string;
  officialDescription: string;
  officialUrl: string;
}

interface RelevantVote {
  externalId: string;
  occurredAt: string;
  description: string;
  result: string | null;
  officialUrl: string;
}

interface DetectionInput {
  source?: "camara" | "senado";
  billExternalId: string;
  officialCode: string;
  priorStatusLabel: string;
  currentStatusLabel: string;
  checkedAt: string;
  officialUrl?: string;
  movements: RelevantMovement[];
  voteEvents: RelevantVote[];
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

type MovementAlertType = Exclude<AlertType, "status_change" | "vote_result">;

function movementType(description: string): MovementAlertType | null {
  const value = normalized(description);
  if (/transformad[ao] em norma juridica|entrada em vigor|lei em vigor/.test(value)) return "in_force";
  if (/sancionad|sancao|vetad|\bveto\b/.test(value)) return "sanction_or_veto";
  if (/arquivad/.test(value)) return "archived";
  if (/incluid[ao] na (ordem do dia|pauta)|agendad[ao].*votacao|votacao agendada/.test(value)) return "vote_scheduled";
  return null;
}

const titles: Record<Exclude<AlertType, "status_change">, (code: string) => string> = {
  vote_scheduled: (code) => `Votação agendada · ${code}`,
  vote_result: (code) => `Resultado de votação · ${code}`,
  sanction_or_veto: (code) => `Sanção ou veto registrado · ${code}`,
  archived: (code) => `Projeto arquivado · ${code}`,
  in_force: (code) => `Norma publicada · ${code}`,
};

export function detectAlertCandidates(input: DetectionInput): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];
  const keyPrefix = `${input.source ?? "legislative"}:${input.billExternalId}`;
  if (input.priorStatusLabel !== input.currentStatusLabel) {
    candidates.push({
      type: "status_change",
      dedupeKey: `${keyPrefix}:status:${input.priorStatusLabel}->${input.currentStatusLabel}`,
      occurredAt: input.checkedAt,
      title: `Situação atualizada · ${input.officialCode}`,
      officialDescription: `Situação alterada de “${input.priorStatusLabel}” para “${input.currentStatusLabel}”.`,
      officialUrl: input.officialUrl ?? "",
    });
  }
  for (const movement of input.movements) {
    const type = movementType(movement.officialDescription);
    if (!type) continue;
    candidates.push({
      type,
      dedupeKey: `${keyPrefix}:movement:${movement.externalId}:${type}`,
      occurredAt: movement.occurredAt,
      title: titles[type](input.officialCode),
      officialDescription: movement.officialDescription,
      officialUrl: movement.officialUrl,
    });
  }
  for (const vote of input.voteEvents) {
    if (!vote.result) continue;
    candidates.push({
      type: "vote_result",
      dedupeKey: `${keyPrefix}:vote:${vote.externalId}:result`,
      occurredAt: vote.occurredAt,
      title: titles.vote_result(input.officialCode),
      officialDescription: `${vote.description} Resultado oficial: ${vote.result}.`,
      officialUrl: vote.officialUrl,
    });
  }
  return candidates;
}
