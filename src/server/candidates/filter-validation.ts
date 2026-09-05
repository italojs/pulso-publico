import type { CandidateFilters } from "#/server/candidates/read-models";

export const MAX_BIGINT_CENTS = 9_223_372_036_854_775_807n;
export const MAX_CANDIDATE_AGE = 150;
export const MAX_CANDIDATE_ASSET_COUNT = 1_000_000;
export const MAX_CANDIDATE_PAGE = 100_000;
export const MAX_CANDIDATE_PAGE_SIZE = 50;

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

function assertInteger(field: string, value: number | undefined, minimum: number, maximum: number): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
}

function assertMoney(field: string, value: bigint | undefined): void {
  if (value === undefined) return;
  if (typeof value !== "bigint" || value < 0n || value > MAX_BIGINT_CENTS) {
    throw new RangeError(`${field} must fit a non-negative PostgreSQL bigint`);
  }
}

function assertRange(
  minimumField: string,
  minimum: number | bigint | undefined,
  maximumField: string,
  maximum: number | bigint | undefined,
): void {
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw new RangeError(`${minimumField} must not exceed ${maximumField}`);
  }
}

export function assertCandidateFilterBounds(filters: Partial<CandidateFilters>, page?: number): void {
  assertInteger("ageMin", filters.ageMin, 0, MAX_CANDIDATE_AGE);
  assertInteger("ageMax", filters.ageMax, 0, MAX_CANDIDATE_AGE);
  assertInteger("assetCountMin", filters.assetCountMin, 0, MAX_CANDIDATE_ASSET_COUNT);
  assertInteger("assetCountMax", filters.assetCountMax, 0, MAX_CANDIDATE_ASSET_COUNT);
  assertInteger("page", page ?? filters.page, 1, MAX_CANDIDATE_PAGE);
  assertInteger("pageSize", filters.pageSize, 1, MAX_CANDIDATE_PAGE_SIZE);

  for (const [field, value] of [
    ["assetMinCents", filters.assetMinCents], ["assetMaxCents", filters.assetMaxCents],
    ["revenueMinCents", filters.revenueMinCents], ["revenueMaxCents", filters.revenueMaxCents],
    ["expenseMinCents", filters.expenseMinCents], ["expenseMaxCents", filters.expenseMaxCents],
    ["balanceMinCents", filters.balanceMinCents], ["balanceMaxCents", filters.balanceMaxCents],
  ] as const) assertMoney(field, value);

  assertRange("ageMin", filters.ageMin, "ageMax", filters.ageMax);
  assertRange("assetCountMin", filters.assetCountMin, "assetCountMax", filters.assetCountMax);
  assertRange("assetMinCents", filters.assetMinCents, "assetMaxCents", filters.assetMaxCents);
  assertRange("revenueMinCents", filters.revenueMinCents, "revenueMaxCents", filters.revenueMaxCents);
  assertRange("expenseMinCents", filters.expenseMinCents, "expenseMaxCents", filters.expenseMaxCents);
  assertRange("balanceMinCents", filters.balanceMinCents, "balanceMaxCents", filters.balanceMaxCents);
}
