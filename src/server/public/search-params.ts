import type {
  PublicBillFilters,
  PublicBillOrder,
  PublicIndividualVoteAvailability,
  PublicVoteKind,
  PublicVotePresence,
  PublicVoteResult,
} from "#/server/public/read-models";
import type { LegislativeSourceName } from "#/domain/legislative";

export type RawSearchParams = Record<string, string | string[] | undefined>;

const MAX_VALUES = 20;
const MAX_TEXT_LENGTH = 200;

const SOURCE_VALUES = ["camara", "senado"] as const satisfies readonly LegislativeSourceName[];
const ORIGIN_HOUSE_VALUES = ["camara", "senado", "congresso"] as const;
const CURRENT_HOUSE_VALUES = [...ORIGIN_HOUSE_VALUES, "nao_informada"] as const;
const STAGE_VALUES = [
  "presented",
  "committees",
  "ready_for_vote",
  "voted",
  "sanction_or_veto",
  "closed",
  "unclassified",
] as const;
const VOTE_KIND_VALUES = ["nominal", "secret", "non_nominal"] as const;
const VOTE_RESULT_VALUES = ["approved", "rejected", "other", "unavailable"] as const;
const UF_VALUES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
const REGION_VALUES = [...UF_VALUES, "nao_informada"] as const;

// These are the proposal abbreviations used by the Câmara and Senado feeds. The
// database still keeps the original code, so adding a new official abbreviation
// here is a backwards-compatible contract change.
const isRecordValue = (value: string | string[] | undefined): value is string | string[] => value !== undefined;

/** Read, trim, deduplicate and cap one repeated query-string parameter. */
function values(value: string | string[] | undefined): string[] {
  if (!isRecordValue(value)) return [];
  const source = Array.isArray(value) ? value : [value];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length === MAX_VALUES) break;
  }
  return result;
}

function enumValues<const T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T[] {
  const allowedSet = new Set<string>(allowed);
  return values(value).filter((item): item is T => allowedSet.has(item));
}

function proposalTypeValues(value: string | string[] | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of values(value)) {
    const normalized = item.toUpperCase();
    if (!/^[A-Z]{2,10}$/.test(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function text(value: string | string[] | undefined): string | undefined {
  const normalized = values(value)[0];
  return normalized ? normalized.slice(0, MAX_TEXT_LENGTH) : undefined;
}

function textValues(value: string | string[] | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of values(value)) {
    const bounded = item.slice(0, MAX_TEXT_LENGTH);
    if (seen.has(bounded)) continue;
    seen.add(bounded);
    result.push(bounded);
  }
  return result;
}

function positiveInteger(value: string | string[] | undefined): number | undefined {
  const candidate = values(value)[0];
  if (!candidate || !/^\d+$/.test(candidate)) return undefined;
  const result = Number(candidate);
  return Number.isSafeInteger(result) && result > 0 ? result : undefined;
}

function isoDate(value: string | string[] | undefined): string | undefined {
  const candidate = values(value)[0];
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return undefined;
  const [year, month, day] = candidate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 0) - 1 && date.getUTCDate() === day
    ? candidate
    : undefined;
}

function setArray<K extends keyof PublicBillFilters>(
  filters: PublicBillFilters,
  key: K,
  value: PublicBillFilters[K],
) {
  if (Array.isArray(value) && value.length > 0) filters[key] = value;
}

export function parseFeedSearchParams(params: RawSearchParams): PublicBillFilters {
  const filters: PublicBillFilters = { page: positiveInteger(params.pagina) ?? 1, pageSize: 20 };

  const query = text(params.q);
  if (query) filters.query = query;

  const proposalTypes = proposalTypeValues(params.tipo);
  setArray(filters, "proposalTypes", proposalTypes);
  if (proposalTypes[0]) filters.proposalType = proposalTypes[0];
  const proposalNumber = positiveInteger(params.numero);
  if (proposalNumber !== undefined) filters.proposalNumber = proposalNumber;

  const yearFrom = positiveInteger(params.anoInicio);
  const yearTo = positiveInteger(params.anoFim);
  if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo) {
    // A reversed range is not a useful query; dropping both ends is safer than
    // silently changing the user's intended interval.
  } else {
    if (yearFrom !== undefined) filters.yearFrom = yearFrom;
    if (yearTo !== undefined) filters.yearTo = yearTo;
  }

  const sources = enumValues(params.fonte, SOURCE_VALUES);
  setArray(filters, "sources", sources);
  if (sources[0]) filters.source = sources[0];
  const originHouses = enumValues(params.origem, ORIGIN_HOUSE_VALUES);
  setArray(filters, "originHouses", originHouses);
  const currentHouses = enumValues(params.casaAtual, CURRENT_HOUSE_VALUES);
  setArray(filters, "currentHouses", currentHouses);
  const stages = enumValues(params.fase, STAGE_VALUES);
  setArray(filters, "stages", stages);
  const statuses = textValues(params.situacao);
  setArray(filters, "statuses", statuses);
  if (statuses[0]) filters.status = statuses[0];

  const presentedStart = isoDate(params.apresentadaInicio);
  const presentedEnd = isoDate(params.apresentadaFim);
  if (!(presentedStart && presentedEnd && presentedStart > presentedEnd)) {
    if (presentedStart) filters.presentedStart = presentedStart;
    if (presentedEnd) filters.presentedEnd = presentedEnd;
  }
  const activityStart = isoDate(params.atividadeInicio);
  const activityEnd = isoDate(params.atividadeFim);
  if (!(activityStart && activityEnd && activityStart > activityEnd)) {
    if (activityStart) filters.activityStart = activityStart;
    if (activityEnd) filters.activityEnd = activityEnd;
  }

  const votePresence = enumValues(params.votacao, ["with", "without"] as const)[0] as PublicVotePresence | undefined;
  if (votePresence) filters.votePresence = votePresence;
  setArray(filters, "voteKinds", enumValues(params.tipoVotacao, VOTE_KIND_VALUES) as PublicVoteKind[]);
  const individualVoteAvailability = enumValues(params.votosIndividuais, ["available", "unavailable"] as const)[0] as PublicIndividualVoteAvailability | undefined;
  if (individualVoteAvailability) filters.individualVoteAvailability = individualVoteAvailability;
  setArray(filters, "voteResults", enumValues(params.resultado, VOTE_RESULT_VALUES) as PublicVoteResult[]);
  setArray(filters, "voteHouses", enumValues(params.casaVotacao, ORIGIN_HOUSE_VALUES));

  const topics = textValues(params.tema);
  setArray(filters, "topics", topics);
  if (topics[0]) filters.topic = topics[0];
  const authors = textValues(params.autor);
  setArray(filters, "authors", authors);
  if (authors[0]) filters.author = authors[0];
  const parties = textValues(params.partido);
  setArray(filters, "parties", parties);
  if (parties[0]) filters.party = parties[0];
  setArray(filters, "regions", enumValues(params.uf, REGION_VALUES));

  if (first(params.acompanhando) === "1") filters.followedOnly = true;
  const rawOrder = first(params.ordem);
  const order = rawOrder === "presented" ? "presented_desc" : enumValues(rawOrder, [
    "updated", "presented_desc", "presented_asc", "most_movements", "most_votes",
  ] as const)[0] as PublicBillOrder | undefined;
  if (order) filters.order = order;

  return filters;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0]?.trim() : value?.trim();
}

function appendAll(params: URLSearchParams, key: string, value: string[] | undefined) {
  for (const item of values(value)) params.append(key, item.slice(0, MAX_TEXT_LENGTH));
}

function appendDateRange(params: URLSearchParams, startKey: string, endKey: string, start?: string, end?: string) {
  const validStart = start ? isoDate(start) : undefined;
  const validEnd = end ? isoDate(end) : undefined;
  if (validStart && validEnd && validStart > validEnd) return;
  if (validStart) params.set(startKey, validStart);
  if (validEnd) params.set(endKey, validEnd);
}

export function buildFeedHref(filters: Partial<PublicBillFilters>, page: number): string {
  const params = new URLSearchParams();
  const query = filters.query ?? undefined;
  if (query?.trim()) params.set("q", query.trim().slice(0, MAX_TEXT_LENGTH));
  appendAll(params, "tipo", filters.proposalTypes);
  if (filters.proposalNumber && Number.isSafeInteger(filters.proposalNumber) && filters.proposalNumber > 0) {
    params.set("numero", String(filters.proposalNumber));
  }
  const validYearFrom = filters.yearFrom && Number.isSafeInteger(filters.yearFrom) && filters.yearFrom > 0 ? filters.yearFrom : undefined;
  const validYearTo = filters.yearTo && Number.isSafeInteger(filters.yearTo) && filters.yearTo > 0 ? filters.yearTo : undefined;
  if (!(validYearFrom !== undefined && validYearTo !== undefined && validYearFrom > validYearTo)) {
    if (validYearFrom !== undefined) params.set("anoInicio", String(validYearFrom));
    if (validYearTo !== undefined) params.set("anoFim", String(validYearTo));
  }
  appendAll(params, "fonte", filters.sources ?? (filters.source ? [filters.source] : undefined));
  appendAll(params, "origem", filters.originHouses);
  appendAll(params, "casaAtual", filters.currentHouses);
  appendAll(params, "fase", filters.stages);
  appendAll(params, "situacao", filters.statuses ?? (filters.status ? [filters.status] : undefined));
  appendDateRange(params, "apresentadaInicio", "apresentadaFim", filters.presentedStart, filters.presentedEnd);
  appendDateRange(params, "atividadeInicio", "atividadeFim", filters.activityStart, filters.activityEnd);
  if (filters.votePresence) params.set("votacao", filters.votePresence);
  appendAll(params, "tipoVotacao", filters.voteKinds);
  if (filters.individualVoteAvailability) params.set("votosIndividuais", filters.individualVoteAvailability);
  appendAll(params, "resultado", filters.voteResults);
  appendAll(params, "casaVotacao", filters.voteHouses);
  appendAll(params, "tema", filters.topics ?? (filters.topic ? [filters.topic] : undefined));
  appendAll(params, "autor", filters.authors ?? (filters.author ? [filters.author] : undefined));
  appendAll(params, "partido", filters.parties ?? (filters.party ? [filters.party] : undefined));
  appendAll(params, "uf", filters.regions);
  if (filters.followedOnly) params.set("acompanhando", "1");
  if (filters.order) params.set("ordem", filters.order);
  if (Number.isSafeInteger(page) && page > 1) params.set("pagina", String(page));
  const queryString = params.toString();
  return queryString ? `/?${queryString}` : "/";
}

function hasValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false && value !== "";
}

export function countActiveFilters(filters: PublicBillFilters): number {
  let count = 0;
  const groups: unknown[] = [
    filters.query,
    filters.proposalTypes ?? (filters.proposalType ? [filters.proposalType] : undefined),
    filters.proposalNumber,
    filters.yearFrom ?? filters.yearTo,
    filters.sources ?? (filters.source ? [filters.source] : undefined),
    filters.originHouses,
    filters.currentHouses,
    filters.stages,
    filters.statuses ?? (filters.status ? [filters.status] : undefined),
    filters.presentedStart ?? filters.presentedEnd,
    filters.activityStart ?? filters.activityEnd,
    filters.votePresence,
    filters.voteKinds,
    filters.individualVoteAvailability,
    filters.voteResults,
    filters.voteHouses,
    filters.topics ?? (filters.topic ? [filters.topic] : undefined),
    filters.authors ?? (filters.author ? [filters.author] : undefined),
    filters.parties ?? (filters.party ? [filters.party] : undefined),
    filters.regions,
    filters.followedOnly,
  ];
  for (const value of groups) if (hasValue(value)) count += 1;
  return count;
}
