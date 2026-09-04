export type ProposalIdentity = {
  proposalType: string | null;
  proposalNumber: number | null;
  proposalYear: number | null;
};

export type SimplifiedStage =
  | "presented"
  | "committees"
  | "ready_for_vote"
  | "voted"
  | "sanction_or_veto"
  | "closed"
  | "unclassified";

export type VoteResultCategory = "approved" | "rejected" | "other" | "unavailable";

const fold = (value: string) => value.normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "").toLowerCase();

export function parseProposalIdentity(officialCode: string): ProposalIdentity {
  const match = officialCode.toUpperCase().match(/^([A-Z]{2,10})\s*(?:N[º°O]?\s*)?(\d{1,9})(?:\s*[/,]\s*(?:DE\s*)?(\d{4}))?/);

  return match
    ? {
        proposalType: match[1] ?? null,
        proposalNumber: Number(match[2]),
        proposalYear: match[3] ? Number(match[3]) : null,
      }
    : { proposalType: null, proposalNumber: null, proposalYear: null };
}

type StageRule = { stage: SimplifiedStage; terms: readonly string[] };

// More specific terminal states come first: e.g. "aprovado e transformado em
// norma jurídica" is closed, rather than merely voted.
const stageRules: readonly StageRule[] = [
  {
    stage: "closed",
    terms: ["transformada em norma juridica", "transformado em norma juridica", "arquivada", "arquivado", "encerrada", "encerrado", "prejudicada", "prejudicado", "retirada de pauta"],
  },
  {
    stage: "sanction_or_veto",
    terms: ["encaminhada a sancao", "encaminhado a sancao", "aguardando sancao", "sancionada", "sancionado", "vetada", "vetado", "veto"],
  },
  {
    stage: "ready_for_vote",
    terms: ["pronta para pauta", "pronto para pauta", "pronta para votacao", "pronto para votacao", "incluida na pauta", "incluido na pauta", "ordem do dia", "aguardando votacao"],
  },
  {
    stage: "voted",
    terms: ["votacao concluida", "votacao realizada", "materia votada", "projeto votado", "aprovada", "aprovado", "rejeitada", "rejeitado", "votada", "votado", "deliberada", "deliberado"],
  },
  {
    stage: "committees",
    terms: ["comissao", "comissoes", "parecer", "relator", "relatoria"],
  },
  {
    stage: "presented",
    terms: ["apresentada", "apresentado", "apresentacao", "recebida", "recebido", "protocolada", "protocolado"],
  },
];

type VoteResultRule = { category: Exclude<VoteResultCategory, "unavailable" | "other">; expression: RegExp };

const voteResultRules: readonly VoteResultRule[] = [
  { category: "approved", expression: /(^|\s)aprovad[oa]s?(?=\s|$|[.,;:])/i },
  { category: "rejected", expression: /(^|\s)rejeitad[oa]s?(?=\s|$|[.,;:])/i },
];

export function classifySimplifiedStage(statusLabel: string): SimplifiedStage {
  const normalized = fold(statusLabel.trim());
  if (!normalized) return "unclassified";

  for (const rule of stageRules) {
    if (rule.terms.some((term) => normalized.includes(term))) return rule.stage;
  }

  return "unclassified";
}

export function classifyVoteResult(result: string | null): VoteResultCategory {
  if (result === null || !result.trim()) return "unavailable";

  const normalized = fold(result.trim());
  const negated = /\bnao\s+(?:foi\s+)?(?:aprovad[oa]s?|rejeitad[oa]s?)\b/i.test(normalized);
  const matches = voteResultRules.filter((rule) => rule.expression.test(normalized));

  if (negated || matches.length !== 1) return "other";
  return matches[0]?.category ?? "other";
}
