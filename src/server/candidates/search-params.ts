import { CandidateOffice, type CandidateOffice as CandidateOfficeName } from "#/domain/electoral";
import type { CandidateFilters, CandidateOrder } from "#/server/candidates/read-models";
import {
  canonicalizeCandidateFilters,
  CANDIDATE_FUNDING_KIND_VALUES,
  CANDIDATE_LAWMAKER_HOUSE_VALUES,
  CANDIDATE_ORDER_VALUES,
  CANDIDATE_REGION_VALUES,
  centsToReais,
  isSafeCandidateFilterText,
  isValidCandidateFilterText,
  MAX_CANDIDATE_AGE,
  MAX_CANDIDATE_ASSET_COUNT,
  MAX_CANDIDATE_FILTER_VALUES,
  MAX_CANDIDATE_PAGE,
  MAX_CANDIDATE_PAGE_SIZE,
  MAX_CANDIDATE_TEXT_LENGTH,
  reaisToCents,
  signedCentsToReais,
  signedReaisToCents,
} from "#/server/candidates/filter-validation";

export { centsToReais, reaisToCents, signedCentsToReais, signedReaisToCents } from "#/server/candidates/filter-validation";

export type CandidateRawSearchParams = Record<string, string | string[] | undefined>;

export interface CandidateComparisonSelection {
  year: number;
  ids: string[];
}

export interface CandidateComparisonSearchParams extends CandidateComparisonSelection {
  valid: boolean;
}

const MAX_VALUES = MAX_CANDIDATE_FILTER_VALUES;
const MAX_TEXT_LENGTH = MAX_CANDIDATE_TEXT_LENGTH;
const candidateComparisonIdPattern = /^\d{1,30}$/;

export function parseCandidateComparisonSearchParams(
  params: CandidateRawSearchParams,
): CandidateComparisonSearchParams {
  const rawYear = params.ano;
  const yearText = rawYear === undefined ? "2026" : Array.isArray(rawYear) ? undefined : rawYear;
  if (!yearText || !/^\d{4}$/.test(yearText)) return { year: 2026, ids: [], valid: false };
  const year = Number(yearText);
  if (!Number.isSafeInteger(year) || year < 2026 || year > 9999) {
    return { year: 2026, ids: [], valid: false };
  }
  const sourceIds = params.id === undefined ? [] : Array.isArray(params.id) ? params.id : [params.id];
  if (sourceIds.some((id) => !candidateComparisonIdPattern.test(id))) {
    return { year, ids: [], valid: false };
  }
  return { year, ids: [...new Set(sourceIds)], valid: true };
}

export function parseCandidateCatalogComparisonSearchParams(
  params: CandidateRawSearchParams,
): CandidateComparisonSearchParams {
  if (params.compararAno === undefined && params.compararId === undefined) {
    return { year: 2026, ids: [], valid: true };
  }
  if (params.compararAno === undefined) return { year: 2026, ids: [], valid: false };
  const selection = parseCandidateComparisonSearchParams({
    ano: params.compararAno,
    id: params.compararId,
  });
  return selection.valid && selection.ids.length <= 3
    ? selection
    : { year: selection.year, ids: [], valid: false };
}

export function buildCandidateComparisonHref(year: number, ids: readonly string[]): string {
  if (!Number.isSafeInteger(year) || year < 2026 || year > 9999) {
    throw new RangeError("Invalid candidate comparison election year");
  }
  if (ids.some((id) => !candidateComparisonIdPattern.test(id))) {
    throw new RangeError("Invalid candidate comparison identifier");
  }
  const distinctIds = [...new Set(ids)];
  if (distinctIds.length > 3) throw new RangeError("Candidate comparison accepts at most three identifiers");
  const params = new URLSearchParams({ ano: String(year) });
  for (const id of distinctIds) params.append("id", id);
  return `/candidatos/comparar?${params.toString()}`;
}

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

function safeTextValues(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const source = Array.isArray(value) ? value : [value];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    if (!isSafeCandidateFilterText(item)) continue;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length === MAX_VALUES) break;
  }
  return result;
}

function text(value: string | string[] | undefined): string | undefined {
  const selected = safeTextValues(value)[0];
  if (selected === undefined) return undefined;
  const bounded = selected?.slice(0, MAX_TEXT_LENGTH);
  return bounded !== undefined && isValidCandidateFilterText(bounded) ? bounded : undefined;
}

function texts(value: string | string[] | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const selected of safeTextValues(value)) {
    const bounded = selected.slice(0, MAX_TEXT_LENGTH);
    if (!isValidCandidateFilterText(bounded) || seen.has(bounded)) continue;
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

function signedMoney(value: string | string[] | undefined): bigint | undefined {
  const selected = values(value)[0];
  return selected === undefined ? undefined : signedReaisToCents(selected);
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
  setArray(filters, "regions", enums(params.uf, CANDIDATE_REGION_VALUES));
  const coverage = values(params.abrangencia);
  if (!filters.regions?.length && coverage.length === 1 && coverage[0] === "brasil") {
    filters.allBrazil = true;
  }
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
  setRange(filters, "balanceMinCents", "balanceMaxCents", signedMoney(params.saldoMin), signedMoney(params.saldoMax));
  setArray(filters, "fundingKinds", enums(params.origemRecurso, CANDIDATE_FUNDING_KIND_VALUES));
  for (const [key, parameter] of [
    ["hasPhoto", "comFoto"], ["hasSocial", "comRedes"], ["hasGovernmentPlan", "comProposta"],
    ["hasCertificates", "comCertidoes"], ["hasFinance", "comFinancas"],
    ["hasConfirmedLawmaker", "comHistorico"], ["activeMandate", "mandatoAtivo"],
  ] as const) {
    const selected = boolean(params[parameter]);
    if (selected !== undefined) filters[key] = selected;
  }
  setArray(filters, "lawmakerHouses", enums(params.casa, CANDIDATE_LAWMAKER_HOUSE_VALUES));
  setArray(filters, "topics", texts(params.tema));
  if (values(params.acompanhando)[0] === "1") filters.followedOnly = true;
  const order = enums(params.ordem, CANDIDATE_ORDER_VALUES)[0] as CandidateOrder | undefined;
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

function appendSignedMoney(params: URLSearchParams, key: string, selected: bigint | undefined) {
  if (selected === undefined) return;
  const encoded = signedCentsToReais(selected);
  if (encoded !== undefined) params.set(key, encoded);
}

function appendBoolean(params: URLSearchParams, key: string, selected: boolean | undefined) {
  if (selected !== undefined) params.set(key, selected ? "1" : "0");
}

export function buildCandidateHref(filters: Partial<CandidateFilters>, page = filters.page ?? 1): string {
  filters = canonicalizeCandidateFilters(filters, page);
  const params = new URLSearchParams();
  if (filters.allBrazil) params.set("abrangencia", "brasil");
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
  appendSignedMoney(params, "saldoMin", filters.balanceMinCents);
  appendSignedMoney(params, "saldoMax", filters.balanceMaxCents);
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

export function buildCandidateCatalogHref(
  filters: Partial<CandidateFilters>,
  page = filters.page ?? 1,
  comparison?: CandidateComparisonSelection,
): string {
  return buildCandidateCatalogSelectionHref(buildCandidateHref(filters, page), comparison);
}

export function buildCandidateCatalogSelectionHref(
  href: string,
  comparison?: CandidateComparisonSelection,
): string {
  const url = new URL(href, "https://catalog.invalid");
  if (url.origin !== "https://catalog.invalid" || url.pathname !== "/candidatos") {
    throw new RangeError("Invalid candidate catalog URL");
  }
  url.searchParams.delete("compararAno");
  url.searchParams.delete("compararId");
  if (comparison?.ids.length) {
    buildCandidateComparisonHref(comparison.year, comparison.ids);
    url.searchParams.set("compararAno", String(comparison.year));
    for (const id of comparison.ids) url.searchParams.append("compararId", id);
  }
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
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
