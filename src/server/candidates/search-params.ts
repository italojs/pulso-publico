import { CandidateOffice, type CandidateOffice as CandidateOfficeName } from "#/domain/electoral";
import type { CandidateFilters, CandidateOrder } from "#/server/candidates/read-models";
import {
  assertCandidateFilterBounds,
  centsToReais,
  MAX_CANDIDATE_AGE,
  MAX_CANDIDATE_ASSET_COUNT,
  MAX_CANDIDATE_PAGE,
  MAX_CANDIDATE_PAGE_SIZE,
  reaisToCents,
} from "#/server/candidates/filter-validation";

export { centsToReais, reaisToCents } from "#/server/candidates/filter-validation";

export type CandidateRawSearchParams = Record<string, string | string[] | undefined>;

const MAX_VALUES = 20;
const MAX_TEXT_LENGTH = 200;
const REGIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO", "BR",
] as const;
const FUNDING_KINDS = ["public", "private", "own"] as const;
const LAWMAKER_HOUSES = ["camara", "senado"] as const;
const ORDERS = [
  "name", "number", "updated", "assets_desc", "revenue_desc", "expenses_desc", "projects_desc", "votes_desc",
] as const satisfies readonly CandidateOrder[];

function values(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
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

function text(value: string | string[] | undefined): string | undefined {
  const selected = values(value)[0];
  return selected?.slice(0, MAX_TEXT_LENGTH) || undefined;
}

function texts(value: string | string[] | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const selected of values(value)) {
    const bounded = selected.slice(0, MAX_TEXT_LENGTH);
    if (!bounded || seen.has(bounded)) continue;
    seen.add(bounded);
    result.push(bounded);
  }
  return result;
}

function enums<const T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T[] {
  const allowedSet = new Set<string>(allowed);
  return values(value).filter((item): item is T => allowedSet.has(item));
}

function integers(
  value: string | string[] | undefined,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number[] {
  return values(value).flatMap((candidate) => {
    if (!/^\d+$/.test(candidate)) return [];
    const parsed = Number(candidate);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? [parsed] : [];
  });
}

function firstInteger(value: string | string[] | undefined, minimum: number, maximum: number): number | undefined {
  return integers(value, minimum, maximum)[0];
}

function boolean(value: string | string[] | undefined): boolean | undefined {
  const selected = values(value)[0];
  if (selected === "1") return true;
  if (selected === "0") return false;
  return undefined;
}

function money(value: string | string[] | undefined): bigint | undefined {
  const selected = values(value)[0];
  return selected === undefined ? undefined : reaisToCents(selected);
}

function setArray<K extends keyof CandidateFilters>(
  filters: CandidateFilters,
  key: K,
  selected: CandidateFilters[K],
): void {
  if (Array.isArray(selected) && selected.length > 0) filters[key] = selected;
}

function setRange<KMin extends keyof CandidateFilters, KMax extends keyof CandidateFilters>(
  filters: CandidateFilters,
  minKey: KMin,
  maxKey: KMax,
  minimum: CandidateFilters[KMin],
  maximum: CandidateFilters[KMax],
): void {
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) return;
  if (minimum !== undefined) filters[minKey] = minimum;
  if (maximum !== undefined) filters[maxKey] = maximum;
}

export function parseCandidateSearchParams(params: CandidateRawSearchParams): CandidateFilters {
  const filters: CandidateFilters = {
    page: firstInteger(params.pagina, 1, MAX_CANDIDATE_PAGE) ?? 1,
    pageSize: firstInteger(params.porPagina, 1, MAX_CANDIDATE_PAGE_SIZE) ?? 20,
  };
  const query = text(params.q);
  if (query) filters.query = query;
  setArray(filters, "electionYears", integers(params.ano, 2026, 9999));
  setArray(filters, "offices", enums(params.cargo, CandidateOffice.options) as CandidateOfficeName[]);
  setArray(filters, "regions", enums(params.uf, REGIONS));
  setArray(filters, "parties", texts(params.partido));
  setArray(filters, "rounds", integers(params.turno, 1, 9));
  setArray(filters, "statuses", texts(params.situacao));
  setArray(filters, "federations", texts(params.federacao));
  setArray(filters, "coalitions", texts(params.coligacao));
  setRange(filters, "ageMin", "ageMax", firstInteger(params.idadeMin, 0, MAX_CANDIDATE_AGE), firstInteger(params.idadeMax, 0, MAX_CANDIDATE_AGE));
  setArray(filters, "genders", texts(params.genero));
  setArray(filters, "races", texts(params.raca));
  setArray(filters, "educations", texts(params.escolaridade));
  setArray(filters, "occupations", texts(params.ocupacao));
  const declaredAssets = enums(params.declarouBens, ["yes", "no"] as const)[0];
  if (declaredAssets) filters.declaredAssets = declaredAssets;
  setRange(filters, "assetMinCents", "assetMaxCents", money(params.patrimonioMin), money(params.patrimonioMax));
  setRange(filters, "assetCountMin", "assetCountMax", firstInteger(params.quantidadeBensMin, 0, MAX_CANDIDATE_ASSET_COUNT), firstInteger(params.quantidadeBensMax, 0, MAX_CANDIDATE_ASSET_COUNT));
  setArray(filters, "assetCategories", texts(params.categoriaBem));
  setRange(filters, "revenueMinCents", "revenueMaxCents", money(params.receitaMin), money(params.receitaMax));
  setRange(filters, "expenseMinCents", "expenseMaxCents", money(params.despesaMin), money(params.despesaMax));
  setRange(filters, "balanceMinCents", "balanceMaxCents", money(params.saldoMin), money(params.saldoMax));
  setArray(filters, "fundingKinds", enums(params.origemRecurso, FUNDING_KINDS));
  for (const [key, parameter] of [
    ["hasPhoto", "comFoto"], ["hasSocial", "comRedes"], ["hasGovernmentPlan", "comProposta"],
    ["hasCertificates", "comCertidoes"], ["hasFinance", "comFinancas"],
    ["hasConfirmedLawmaker", "comHistorico"], ["activeMandate", "mandatoAtivo"],
  ] as const) {
    const selected = boolean(params[parameter]);
    if (selected !== undefined) filters[key] = selected;
  }
  setArray(filters, "lawmakerHouses", enums(params.casa, LAWMAKER_HOUSES));
  setArray(filters, "topics", texts(params.tema));
  if (values(params.acompanhando)[0] === "1") filters.followedOnly = true;
  const order = enums(params.ordem, ORDERS)[0];
  if (order) filters.order = order;
  return filters;
}

function appendValues(params: URLSearchParams, key: string, selected: readonly (string | number)[] | undefined) {
  const seen = new Set<string>();
  for (const item of selected ?? []) {
    const normalized = String(item).trim().slice(0, MAX_TEXT_LENGTH);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    params.append(key, normalized);
    if (seen.size === MAX_VALUES) break;
  }
}

function appendMoney(params: URLSearchParams, key: string, selected: bigint | undefined) {
  if (selected === undefined) return;
  const encoded = centsToReais(selected);
  if (encoded !== undefined) params.set(key, encoded);
}

function appendBoolean(params: URLSearchParams, key: string, selected: boolean | undefined) {
  if (selected !== undefined) params.set(key, selected ? "1" : "0");
}

export function buildCandidateHref(filters: Partial<CandidateFilters>, page = filters.page ?? 1): string {
  assertCandidateFilterBounds(filters, page);
  const params = new URLSearchParams();
  if (filters.query?.trim()) params.set("q", filters.query.trim().slice(0, MAX_TEXT_LENGTH));
  appendValues(params, "ano", filters.electionYears);
  appendValues(params, "cargo", filters.offices);
  appendValues(params, "uf", filters.regions);
  appendValues(params, "partido", filters.parties?.map((value) => value.trim()).filter(Boolean).slice(0, MAX_VALUES));
  appendValues(params, "turno", filters.rounds);
  appendValues(params, "situacao", filters.statuses);
  appendValues(params, "federacao", filters.federations);
  appendValues(params, "coligacao", filters.coalitions);
  if (filters.ageMin !== undefined) params.set("idadeMin", String(filters.ageMin));
  if (filters.ageMax !== undefined) params.set("idadeMax", String(filters.ageMax));
  appendValues(params, "genero", filters.genders);
  appendValues(params, "raca", filters.races);
  appendValues(params, "escolaridade", filters.educations);
  appendValues(params, "ocupacao", filters.occupations);
  if (filters.declaredAssets) params.set("declarouBens", filters.declaredAssets);
  appendMoney(params, "patrimonioMin", filters.assetMinCents);
  appendMoney(params, "patrimonioMax", filters.assetMaxCents);
  if (filters.assetCountMin !== undefined) params.set("quantidadeBensMin", String(filters.assetCountMin));
  if (filters.assetCountMax !== undefined) params.set("quantidadeBensMax", String(filters.assetCountMax));
  appendValues(params, "categoriaBem", filters.assetCategories);
  appendMoney(params, "receitaMin", filters.revenueMinCents);
  appendMoney(params, "receitaMax", filters.revenueMaxCents);
  appendMoney(params, "despesaMin", filters.expenseMinCents);
  appendMoney(params, "despesaMax", filters.expenseMaxCents);
  appendMoney(params, "saldoMin", filters.balanceMinCents);
  appendMoney(params, "saldoMax", filters.balanceMaxCents);
  appendValues(params, "origemRecurso", filters.fundingKinds);
  appendBoolean(params, "comFoto", filters.hasPhoto);
  appendBoolean(params, "comRedes", filters.hasSocial);
  appendBoolean(params, "comProposta", filters.hasGovernmentPlan);
  appendBoolean(params, "comCertidoes", filters.hasCertificates);
  appendBoolean(params, "comFinancas", filters.hasFinance);
  appendBoolean(params, "comHistorico", filters.hasConfirmedLawmaker);
  appendValues(params, "casa", filters.lawmakerHouses);
  appendBoolean(params, "mandatoAtivo", filters.activeMandate);
  appendValues(params, "tema", filters.topics);
  if (filters.followedOnly) params.set("acompanhando", "1");
  if (filters.order) params.set("ordem", filters.order);
  if (Number.isSafeInteger(page) && page > 1) params.set("pagina", String(page));
  if (filters.pageSize !== undefined && filters.pageSize !== 20) params.set("porPagina", String(filters.pageSize));
  const query = params.toString();
  return query ? `/candidatos?${query}` : "/candidatos";
}

function present(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== "";
}

export function countCandidateFilters(filters: CandidateFilters): number {
  const groups: unknown[] = [
    filters.query, filters.electionYears, filters.offices, filters.regions, filters.parties, filters.rounds,
    filters.statuses, filters.federations, filters.coalitions, filters.ageMin ?? filters.ageMax,
    filters.genders, filters.races, filters.educations, filters.occupations, filters.declaredAssets,
    filters.assetMinCents ?? filters.assetMaxCents, filters.assetCountMin ?? filters.assetCountMax,
    filters.assetCategories, filters.revenueMinCents ?? filters.revenueMaxCents,
    filters.expenseMinCents ?? filters.expenseMaxCents, filters.balanceMinCents ?? filters.balanceMaxCents,
    filters.fundingKinds, filters.hasPhoto, filters.hasSocial, filters.hasGovernmentPlan,
    filters.hasCertificates, filters.hasFinance, filters.hasConfirmedLawmaker, filters.lawmakerHouses,
    filters.activeMandate, filters.topics, filters.followedOnly || undefined,
  ];
  return groups.filter(present).length;
}
