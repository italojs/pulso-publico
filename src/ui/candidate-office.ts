import type { CandidateOffice } from "#/domain/electoral";

export const candidateOfficeLabels: Record<CandidateOffice, string> = {
  presidente: "Presidente",
  vice_presidente: "Vice-presidente",
  governador: "Governador",
  vice_governador: "Vice-governador",
  senador: "Senador",
  primeiro_suplente: "1º suplente",
  segundo_suplente: "2º suplente",
  deputado_federal: "Deputado federal",
  deputado_estadual: "Deputado estadual",
  deputado_distrital: "Deputado distrital",
};
