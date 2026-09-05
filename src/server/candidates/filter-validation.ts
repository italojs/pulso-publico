import { CandidateOffice } from "#/domain/electoral";
import type { CandidateFilters } from "#/server/candidates/read-models";

export const MAX_CANDIDATE_FILTER_VALUES = 20;
export const MAX_CANDIDATE_TEXT_LENGTH = 200;
export const MAX_BIGINT_CENTS = 9_223_372_036_854_775_807n;
export const MIN_BIGINT_CENTS = -9_223_372_036_854_775_808n;
export const MAX_CANDIDATE_AGE = 150;
export const MAX_CANDIDATE_ASSET_COUNT = 1_000_000;
export const MAX_CANDIDATE_PAGE = 100_000;
export const MAX_CANDIDATE_PAGE_SIZE = 50;
export const CANDIDATE_REGION_VALUES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO", "BR",
] as const;
export const CANDIDATE_FUNDING_KIND_VALUES = ["public", "private", "own"] as const;
export const CANDIDATE_LAWMAKER_HOUSE_VALUES = ["camara", "senado"] as const;
export const CANDIDATE_ORDER_VALUES = [
  "name", "number", "updated", "assets_desc", "revenue_desc", "expenses_desc", "projects_desc", "votes_desc",
] as const;

export function reaisToCents(value: string): bigint | undefined {
  if (!/^(?:0|[1-9]\d{0,16})(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole = "0", fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return cents <= MAX_BIGINT_CENTS ? cents : undefined;
}

export function centsToReais(value: bigint): string | undefined {
  if (value < 0n || value > MAX_BIGINT_CENTS) return undefined;
  const whole = value / 100n;
  const fraction = value % 100n;
  return fraction === 0n
    ? whole.toString()
    : `${whole}.${fraction.toString().padStart(2, "0").replace(/0$/, "")}`;
}

export function signedReaisToCents(value: string): bigint | undefined {
  if (!/^-?(?:0|[1-9]\d{0,16})(?:\.\d{1,2})?$/.test(value)) return undefined;
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const magnitude = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  const cents = negative ? -magnitude : magnitude;
  return cents >= MIN_BIGINT_CENTS && cents <= MAX_BIGINT_CENTS ? cents : undefined;
}

export function signedCentsToReais(value: bigint): string | undefined {
  if (value < MIN_BIGINT_CENTS || value > MAX_BIGINT_CENTS) return undefined;
  if (value >= 0n) return centsToReais(value);
  const magnitude = -value;
  const whole = magnitude / 100n;
  const fraction = magnitude % 100n;
  return fraction === 0n
    ? `-${whole.toString()}`
    : `-${whole}.${fraction.toString().padStart(2, "0").replace(/0$/, "")}`;
}

export function isSafeCandidateFilterText(value: string): boolean {
  return value.isWellFormed()
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

export function isValidCandidateFilterText(value: string): boolean {
  const normalized = value.trim();
  return isSafeCandidateFilterText(value)
    && normalized.length > 0
    && normalized.length <= MAX_CANDIDATE_TEXT_LENGTH;
}

export type CandidateFilterBoundField =
  | "ageMin" | "ageMax" | "assetCountMin" | "assetCountMax" | "page" | "pageSize"
  | "assetMinCents" | "assetMaxCents" | "revenueMinCents" | "revenueMaxCents"
  | "expenseMinCents" | "expenseMaxCents" | "balanceMinCents" | "balanceMaxCents";

export interface CandidateFilterBoundIssue {
  code: "out_of_bounds" | "reversed_range";
  fields: CandidateFilterBoundField[];
  message: string;
}

export interface CandidateFilterBoundsResult {
  issues: CandidateFilterBoundIssue[];
  valid: boolean;
}

export function validateCandidateFilterBounds(filters: Partial<CandidateFilters>, page?: number): CandidateFilterBoundsResult {
  const issues: CandidateFilterBoundIssue[] = [];
  const integer = (field: CandidateFilterBoundField, value: number | undefined, minimum: number, maximum: number) => {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < minimum || value > maximum)) {
      issues.push({ code: "out_of_bounds", fields: [field], message: `${field} must be an integer between ${minimum} and ${maximum}` });
    }
  };
  const money = (field: CandidateFilterBoundField, value: bigint | undefined) => {
    if (value !== undefined && (typeof value !== "bigint" || value < 0n || value > MAX_BIGINT_CENTS)) {
      issues.push({ code: "out_of_bounds", fields: [field], message: `${field} must fit a non-negative PostgreSQL bigint` });
    }
  };
  const signedMoney = (field: CandidateFilterBoundField, value: bigint | undefined) => {
    if (value !== undefined && (typeof value !== "bigint" || value < MIN_BIGINT_CENTS || value > MAX_BIGINT_CENTS)) {
      issues.push({ code: "out_of_bounds", fields: [field], message: `${field} must fit a PostgreSQL bigint` });
    }
  };
  const range = (
    minimumField: CandidateFilterBoundField,
    minimum: number | bigint | undefined,
    maximumField: CandidateFilterBoundField,
    maximum: number | bigint | undefined,
  ) => {
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      issues.push({ code: "reversed_range", fields: [minimumField, maximumField], message: `${minimumField} must not exceed ${maximumField}` });
    }
  };

  integer("ageMin", filters.ageMin, 0, MAX_CANDIDATE_AGE);
  integer("ageMax", filters.ageMax, 0, MAX_CANDIDATE_AGE);
  integer("assetCountMin", filters.assetCountMin, 0, MAX_CANDIDATE_ASSET_COUNT);
  integer("assetCountMax", filters.assetCountMax, 0, MAX_CANDIDATE_ASSET_COUNT);
  integer("page", page ?? filters.page, 1, MAX_CANDIDATE_PAGE);
  integer("pageSize", filters.pageSize, 1, MAX_CANDIDATE_PAGE_SIZE);

  for (const [field, value] of [
    ["assetMinCents", filters.assetMinCents], ["assetMaxCents", filters.assetMaxCents],
    ["revenueMinCents", filters.revenueMinCents], ["revenueMaxCents", filters.revenueMaxCents],
    ["expenseMinCents", filters.expenseMinCents], ["expenseMaxCents", filters.expenseMaxCents],
  ] as const) money(field, value);
  signedMoney("balanceMinCents", filters.balanceMinCents);
  signedMoney("balanceMaxCents", filters.balanceMaxCents);

  range("ageMin", filters.ageMin, "ageMax", filters.ageMax);
  range("assetCountMin", filters.assetCountMin, "assetCountMax", filters.assetCountMax);
  range("assetMinCents", filters.assetMinCents, "assetMaxCents", filters.assetMaxCents);
  range("revenueMinCents", filters.revenueMinCents, "revenueMaxCents", filters.revenueMaxCents);
  range("expenseMinCents", filters.expenseMinCents, "expenseMaxCents", filters.expenseMaxCents);
  range("balanceMinCents", filters.balanceMinCents, "balanceMaxCents", filters.balanceMaxCents);
  return { issues, valid: issues.length === 0 };
}

export function assertCandidateFilterBounds(filters: Partial<CandidateFilters>, page?: number): void {
  const issue = validateCandidateFilterBounds(filters, page).issues[0];
  if (issue) throw new RangeError(issue.message);
}

export type CandidateFilterCanonicalizationResult =
  | { filters: CandidateFilters; success: true }
  | { error: Error; success: false };

export function safelyCanonicalizeCandidateFilters(
  filters: Partial<CandidateFilters>,
  pageOverride?: number,
): CandidateFilterCanonicalizationResult {
  try {
    return { filters: canonicalizeCandidateFilters(filters, pageOverride), success: true };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Invalid candidate filters"), success: false };
  }
}

const allowedFilterKeys = new Set<keyof CandidateFilters>([
  "allBrazil", "query", "electionYears", "offices", "regions", "parties", "rounds", "statuses", "federations", "coalitions",
  "ageMin", "ageMax", "genders", "races", "educations", "occupations", "declaredAssets",
  "assetMinCents", "assetMaxCents", "assetCountMin", "assetCountMax", "assetCategories",
  "revenueMinCents", "revenueMaxCents", "expenseMinCents", "expenseMaxCents", "balanceMinCents", "balanceMaxCents",
  "fundingKinds", "hasPhoto", "hasSocial", "hasGovernmentPlan", "hasCertificates", "hasFinance",
  "hasConfirmedLawmaker", "lawmakerHouses", "activeMandate", "topics", "followedOnly", "order", "page", "pageSize",
]);

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  const normalized = value.trim();
  if (!isValidCandidateFilterText(value)) {
    throw new RangeError(`${field} must contain 1 to ${MAX_CANDIDATE_TEXT_LENGTH} characters`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requiredText(value, field);
}

function canonicalArray<T>(
  value: unknown,
  field: string,
  normalize: (item: unknown) => T,
): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  const result: T[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = normalize(item);
    const key = typeof normalized === "string" ? normalized : JSON.stringify(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length > MAX_CANDIDATE_FILTER_VALUES) {
      throw new RangeError(`${field} must contain at most ${MAX_CANDIDATE_FILTER_VALUES} unique values`);
    }
  }
  if (result.length === 0) throw new RangeError(`${field} must not be empty`);
  return result;
}

function enumValue<const T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new RangeError(`${field} contains an unsupported value`);
  }
  return value as T;
}

function integerValue(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function booleanValue(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new TypeError(`${field} must be boolean`);
  return value;
}

function moneyValue(value: unknown, field: string): bigint | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "bigint" || value < 0n || value > MAX_BIGINT_CENTS) {
    throw new RangeError(`${field} must fit a non-negative PostgreSQL bigint`);
  }
  return value;
}

function signedMoneyValue(value: unknown, field: string): bigint | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "bigint" || value < MIN_BIGINT_CENTS || value > MAX_BIGINT_CENTS) {
    throw new RangeError(`${field} must fit a PostgreSQL bigint`);
  }
  return value;
}

function assign<T extends keyof CandidateFilters>(
  result: CandidateFilters,
  key: T,
  value: CandidateFilters[T] | undefined,
): void {
  if (value !== undefined) result[key] = value;
}

export function canonicalizeCandidateFilters(
  filters: Partial<CandidateFilters>,
  pageOverride?: number,
): CandidateFilters {
  const raw = filters as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!allowedFilterKeys.has(key as keyof CandidateFilters)) throw new TypeError(`Unknown candidate filter: ${key}`);
  }

  const result: CandidateFilters = {};
  assign(result, "query", optionalText(raw.query, "query"));
  assign(result, "electionYears", canonicalArray(raw.electionYears, "electionYears", (value) => integerValue(value, "electionYears", 2026, 9999)));
  assign(result, "offices", canonicalArray(raw.offices, "offices", (value) => enumValue(value, "offices", CandidateOffice.options)));
  assign(result, "regions", canonicalArray(raw.regions, "regions", (value) => enumValue(value, "regions", CANDIDATE_REGION_VALUES)));
  if (raw.allBrazil !== undefined && raw.allBrazil !== true) {
    throw new TypeError("allBrazil must be true when present");
  }
  if (!result.regions?.length && raw.allBrazil === true) result.allBrazil = true;
  for (const key of [
    "parties", "statuses", "federations", "coalitions", "genders", "races", "educations", "occupations",
    "assetCategories", "topics",
  ] as const) {
    assign(result, key, canonicalArray(raw[key], key, (value) => requiredText(value, key)));
  }
  assign(result, "rounds", canonicalArray(raw.rounds, "rounds", (value) => integerValue(value, "rounds", 1, 9)));

  for (const key of ["ageMin", "ageMax"] as const) {
    if (raw[key] !== undefined) result[key] = integerValue(raw[key], key, 0, MAX_CANDIDATE_AGE);
  }
  for (const key of ["assetCountMin", "assetCountMax"] as const) {
    if (raw[key] !== undefined) result[key] = integerValue(raw[key], key, 0, MAX_CANDIDATE_ASSET_COUNT);
  }
  for (const key of [
    "assetMinCents", "assetMaxCents", "revenueMinCents", "revenueMaxCents",
    "expenseMinCents", "expenseMaxCents",
  ] as const) assign(result, key, moneyValue(raw[key], key));
  for (const key of ["balanceMinCents", "balanceMaxCents"] as const) {
    assign(result, key, signedMoneyValue(raw[key], key));
  }

  if (raw.declaredAssets !== undefined) {
    result.declaredAssets = enumValue(raw.declaredAssets, "declaredAssets", ["yes", "no"] as const);
  }
  assign(result, "fundingKinds", canonicalArray(raw.fundingKinds, "fundingKinds", (value) => enumValue(value, "fundingKinds", CANDIDATE_FUNDING_KIND_VALUES)));
  assign(result, "lawmakerHouses", canonicalArray(raw.lawmakerHouses, "lawmakerHouses", (value) => enumValue(value, "lawmakerHouses", CANDIDATE_LAWMAKER_HOUSE_VALUES)));
  for (const key of [
    "hasPhoto", "hasSocial", "hasGovernmentPlan", "hasCertificates", "hasFinance", "hasConfirmedLawmaker", "activeMandate",
  ] as const) assign(result, key, booleanValue(raw[key], key));
  const followedOnly = booleanValue(raw.followedOnly, "followedOnly");
  if (followedOnly) result.followedOnly = true;
  if (raw.order !== undefined) result.order = enumValue(raw.order, "order", CANDIDATE_ORDER_VALUES);
  if (raw.page !== undefined) result.page = integerValue(raw.page, "page", 1, MAX_CANDIDATE_PAGE);
  if (pageOverride !== undefined) result.page = integerValue(pageOverride, "page", 1, MAX_CANDIDATE_PAGE);
  if (raw.pageSize !== undefined) result.pageSize = integerValue(raw.pageSize, "pageSize", 1, MAX_CANDIDATE_PAGE_SIZE);

  assertCandidateFilterBounds(result);
  return result;
}
