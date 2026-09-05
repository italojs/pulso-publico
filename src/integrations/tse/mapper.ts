import {
  CandidateAssetRecord,
  CandidateSocialLinkRecord,
  CampaignEntryRecord,
  ElectoralCandidateRecord,
  type CandidateAsset,
  type CandidateOffice,
  type CandidateSocialLink,
  type CampaignEntry,
  type ElectoralCandidate,
} from "#/domain/electoral";

type TseRow = Record<string, string | undefined>;

const officeByTseLabel: Record<string, CandidateOffice> = {
  PRESIDENTE: "presidente",
  "VICE-PRESIDENTE": "vice_presidente",
  "VICE PRESIDENTE": "vice_presidente",
  GOVERNADOR: "governador",
  "VICE-GOVERNADOR": "vice_governador",
  "VICE GOVERNADOR": "vice_governador",
  SENADOR: "senador",
  "1º SUPLENTE": "primeiro_suplente",
  "1O SUPLENTE": "primeiro_suplente",
  "PRIMEIRO SUPLENTE": "primeiro_suplente",
  "2º SUPLENTE": "segundo_suplente",
  "2O SUPLENTE": "segundo_suplente",
  "SEGUNDO SUPLENTE": "segundo_suplente",
  "DEPUTADO FEDERAL": "deputado_federal",
  "DEPUTADO ESTADUAL": "deputado_estadual",
  "DEPUTADO DISTRITAL": "deputado_distrital",
};

const booleanByTseLabel: Record<string, boolean> = {
  S: true,
  SIM: true,
  "1": true,
  TRUE: true,
  N: false,
  "NÃO": false,
  NAO: false,
  "0": false,
  FALSE: false,
};

export class TseContractError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "TseContractError";
    this.code = code;
  }
}

function blankToNull(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function required(row: TseRow, column: string, code = `MISSING_${column}`): string {
  const value = blankToNull(row[column]);
  if (!value) throw new TseContractError(code);
  return value;
}

function parseNonnegativeInteger(value: string, code: string): number {
  if (!/^\d+$/.test(value)) throw new TseContractError(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new TseContractError(code);
  return parsed;
}

function normalizeTseLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

function parseElectionYear(row: TseRow): number {
  const year = parseNonnegativeInteger(required(row, "ANO_ELEICAO"), "INVALID_ELECTION_YEAR");
  if (year < 2026) throw new TseContractError("INVALID_ELECTION_YEAR");
  return year;
}

function parseCandidateExternalId(row: TseRow): string {
  return required(row, "SQ_CANDIDATO", "MISSING_CANDIDATE_ID");
}

function parseBoolean(value: string | undefined): boolean {
  const normalized = blankToNull(value);
  if (!normalized) return false;
  const parsed = booleanByTseLabel[normalizeTseLabel(normalized)];
  if (parsed === undefined) throw new TseContractError("INVALID_BOOLEAN");
  return parsed;
}

function parseOptionalDate(value: string | undefined): string | null {
  const date = blankToNull(value);
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!match) throw new TseContractError("INVALID_BIRTH_DATE");
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function checkedAtIso(value: string | Date): string {
  const checkedAt = typeof value === "string" ? value : value.toISOString();
  if (!zIsoDateTime(checkedAt)) throw new TseContractError("INVALID_CHECKED_AT");
  return checkedAt;
}

function zIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

function officialCandidateUrl(year: number, region: string, candidateExternalId: string): string {
  return `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/${year}/${encodeURIComponent(region)}/${encodeURIComponent(candidateExternalId)}`;
}

function selectFirst(row: TseRow, columns: readonly string[]): string | undefined {
  for (const column of columns) {
    const value = blankToNull(row[column]);
    if (value) return value;
  }
  return undefined;
}

export function moneyToCents(value: string): bigint {
  const normalized = value.trim().replaceAll(".", "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new TseContractError("INVALID_MONEY");
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function mapCandidateRow(row: TseRow, checkedAt: string | Date): ElectoralCandidate {
  const electionYear = parseElectionYear(row);
  const externalId = parseCandidateExternalId(row);
  const region = required(row, "SG_UF", "MISSING_REGION");
  const round = parseNonnegativeInteger(row.NR_TURNO?.trim() || "1", "INVALID_ROUND");
  if (round < 1) throw new TseContractError("INVALID_ROUND");
  const officeLabel = normalizeTseLabel(required(row, "DS_CARGO", "MISSING_OFFICE"));
  const office = officeByTseLabel[officeLabel];
  if (!office) throw new TseContractError("UNKNOWN_OFFICE");
  const status = required(row, "DS_SITUACAO_CANDIDATURA", "MISSING_STATUS");

  return ElectoralCandidateRecord.parse({
    electionYear,
    externalId,
    fullName: required(row, "NM_CANDIDATO", "MISSING_FULL_NAME"),
    ballotName: required(row, "NM_URNA_CANDIDATO", "MISSING_BALLOT_NAME"),
    socialName: blankToNull(row.NM_SOCIAL_CANDIDATO),
    number: parseNonnegativeInteger(required(row, "NR_CANDIDATO", "MISSING_CANDIDATE_NUMBER"), "INVALID_CANDIDATE_NUMBER"),
    office,
    round,
    region,
    electoralUnit: blankToNull(row.NM_UE) ?? region,
    status,
    statusDetail: blankToNull(row.DS_DETALHE_SITUACAO_CAND),
    partyAcronym: required(row, "SG_PARTIDO", "MISSING_PARTY_ACRONYM"),
    partyNumber: parseNonnegativeInteger(required(row, "NR_PARTIDO", "MISSING_PARTY_NUMBER"), "INVALID_PARTY_NUMBER"),
    partyName: blankToNull(row.NM_PARTIDO) ?? required(row, "SG_PARTIDO", "MISSING_PARTY_ACRONYM"),
    federation: blankToNull(row.NM_FEDERACAO),
    coalition: blankToNull(row.NM_COLIGACAO),
    seekingReelection: parseBoolean(row.ST_REELEICAO),
    birthDate: parseOptionalDate(row.DT_NASCIMENTO),
    ageAtInauguration: blankToNull(row.NR_IDADE_DATA_POSSE) === null
      ? null
      : parseNonnegativeInteger(required(row, "NR_IDADE_DATA_POSSE"), "INVALID_AGE"),
    gender: blankToNull(row.DS_GENERO),
    race: blankToNull(row.DS_COR_RACA),
    education: blankToNull(row.DS_GRAU_INSTRUCAO),
    occupation: blankToNull(row.DS_OCUPACAO),
    maritalStatus: blankToNull(row.DS_ESTADO_CIVIL),
    nationality: blankToNull(row.DS_NACIONALIDADE),
    birthRegion: blankToNull(row.SG_UF_NASCIMENTO),
    birthCity: blankToNull(row.NM_MUNICIPIO_NASCIMENTO),
    officialUrl: officialCandidateUrl(electionYear, region, externalId),
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapAssetRow(row: TseRow): CandidateAsset {
  return CandidateAssetRecord.parse({
    electionYear: parseElectionYear(row),
    candidateExternalId: parseCandidateExternalId(row),
    category: required(row, "DS_TIPO_BEM_CANDIDATO", "MISSING_ASSET_CATEGORY"),
    description: blankToNull(row.DS_BEM_CANDIDATO),
    valueCents: moneyToCents(required(row, "VR_BEM_CANDIDATO", "MISSING_ASSET_VALUE")),
  });
}

function mapCampaignEntry(row: TseRow, kind: CampaignEntry["kind"], valueColumns: readonly string[], categoryColumns: readonly string[]): CampaignEntry {
  const value = selectFirst(row, valueColumns);
  if (!value) throw new TseContractError("MISSING_CAMPAIGN_VALUE");

  return CampaignEntryRecord.parse({
    electionYear: parseElectionYear(row),
    candidateExternalId: parseCandidateExternalId(row),
    kind,
    category: selectFirst(row, categoryColumns) ?? null,
    valueCents: moneyToCents(value),
  });
}

export function mapCampaignReceiptRow(row: TseRow): CampaignEntry {
  return mapCampaignEntry(
    row,
    "receipt",
    ["VR_RECEITA", "VR_RECEITA_BRUTA"],
    ["DS_ORIGEM_RECEITA", "DS_FONTE_RECEITA", "DS_RECEITA"],
  );
}

export function mapCampaignExpenseRow(row: TseRow): CampaignEntry {
  return mapCampaignEntry(
    row,
    "expense",
    ["VR_DESPESA_CONTRATADA", "VR_DESPESA"],
    ["DS_TIPO_DESPESA", "DS_DESPESA"],
  );
}

export function mapSocialRow(row: TseRow): CandidateSocialLink | null {
  const rawUrl = selectFirst(row, ["DS_URL_REDE_SOCIAL", "DS_URL"]);
  if (!rawUrl) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    return null;
  }

  return CandidateSocialLinkRecord.parse({
    electionYear: parseElectionYear(row),
    candidateExternalId: parseCandidateExternalId(row),
    label: required(row, "DS_REDE_SOCIAL", "MISSING_SOCIAL_LABEL"),
    url: url.toString(),
  });
}
