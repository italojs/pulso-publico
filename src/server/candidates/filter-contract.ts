import { z } from "zod";

import { currentUserFromCookie } from "#/auth/current-user";
import type { UserRepository } from "#/auth/user-repository";
import { CandidateOffice } from "#/domain/electoral";
import {
  canonicalizeCandidateFilters,
  CANDIDATE_FUNDING_KIND_VALUES,
  CANDIDATE_LAWMAKER_HOUSE_VALUES,
  CANDIDATE_ORDER_VALUES,
  CANDIDATE_REGION_VALUES,
  centsToReais,
  isSafeCandidateFilterText,
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
import type { CandidateFilters } from "#/server/candidates/read-models";

const MAX_FILTER_VALUES = MAX_CANDIDATE_FILTER_VALUES;
const MAX_TEXT_LENGTH = MAX_CANDIDATE_TEXT_LENGTH;
const MAX_REQUEST_BYTES = 65_536;

const text = z.string()
  .refine(isSafeCandidateFilterText, "Text must not contain controls or malformed Unicode")
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(MAX_TEXT_LENGTH));
const values = <T extends z.ZodType>(schema: T) => z.array(schema).min(1).max(MAX_FILTER_VALUES);
const nonNegativeInteger = z.number().int().safe().nonnegative();
const positiveInteger = z.number().int().safe().positive();
const money = z.string().refine((value) => reaisToCents(value) !== undefined, "Invalid non-negative reais value");
const signedMoney = z.string().refine((value) => signedReaisToCents(value) !== undefined, "Invalid signed reais value");

export const candidateFilterInputSchema = z.object({
  allBrazil: z.literal(true).optional(),
  query: text.optional(),
  electionYears: values(z.number().int().min(2026).max(9999)).optional(),
  offices: values(CandidateOffice).optional(),
  regions: values(z.enum(CANDIDATE_REGION_VALUES)).optional(),
  parties: values(text).optional(),
  rounds: values(z.number().int().min(1).max(9)).optional(),
  statuses: values(text).optional(),
  federations: values(text).optional(),
  coalitions: values(text).optional(),
  ageMin: nonNegativeInteger.max(MAX_CANDIDATE_AGE).optional(),
  ageMax: nonNegativeInteger.max(MAX_CANDIDATE_AGE).optional(),
  genders: values(text).optional(),
  races: values(text).optional(),
  educations: values(text).optional(),
  occupations: values(text).optional(),
  declaredAssets: z.enum(["yes", "no"]).optional(),
  assetMin: money.optional(),
  assetMax: money.optional(),
  assetCountMin: nonNegativeInteger.max(MAX_CANDIDATE_ASSET_COUNT).optional(),
  assetCountMax: nonNegativeInteger.max(MAX_CANDIDATE_ASSET_COUNT).optional(),
  assetCategories: values(text).optional(),
  revenueMin: money.optional(),
  revenueMax: money.optional(),
  expenseMin: money.optional(),
  expenseMax: money.optional(),
  balanceMin: signedMoney.optional(),
  balanceMax: signedMoney.optional(),
  fundingKinds: values(z.enum(CANDIDATE_FUNDING_KIND_VALUES)).optional(),
  hasPhoto: z.boolean().optional(),
  hasSocial: z.boolean().optional(),
  hasGovernmentPlan: z.boolean().optional(),
  hasCertificates: z.boolean().optional(),
  hasFinance: z.boolean().optional(),
  hasConfirmedLawmaker: z.boolean().optional(),
  lawmakerHouses: values(z.enum(CANDIDATE_LAWMAKER_HOUSE_VALUES)).optional(),
  activeMandate: z.boolean().optional(),
  topics: values(text).optional(),
  followedOnly: z.literal(true).optional(),
  order: z.enum(CANDIDATE_ORDER_VALUES).optional(),
  page: positiveInteger.max(MAX_CANDIDATE_PAGE).optional(),
  pageSize: positiveInteger.max(MAX_CANDIDATE_PAGE_SIZE).optional(),
}).strict().superRefine((input, context) => {
  for (const [minimumKey, maximumKey] of [
    ["ageMin", "ageMax"], ["assetCountMin", "assetCountMax"],
  ] as const) {
    const minimum = input[minimumKey];
    const maximum = input[maximumKey];
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      context.addIssue({ code: "custom", path: [maximumKey], message: `${minimumKey} must not exceed ${maximumKey}` });
    }
  }
  for (const [minimumKey, maximumKey] of [
    ["assetMin", "assetMax"], ["revenueMin", "revenueMax"],
    ["expenseMin", "expenseMax"],
  ] as const) {
    const minimum = input[minimumKey] === undefined ? undefined : reaisToCents(input[minimumKey]);
    const maximum = input[maximumKey] === undefined ? undefined : reaisToCents(input[maximumKey]);
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      context.addIssue({ code: "custom", path: [maximumKey], message: `${minimumKey} must not exceed ${maximumKey}` });
    }
  }
  const balanceMinimum = input.balanceMin === undefined ? undefined : signedReaisToCents(input.balanceMin);
  const balanceMaximum = input.balanceMax === undefined ? undefined : signedReaisToCents(input.balanceMax);
  if (balanceMinimum !== undefined && balanceMaximum !== undefined && balanceMinimum > balanceMaximum) {
    context.addIssue({ code: "custom", path: ["balanceMax"], message: "balanceMin must not exceed balanceMax" });
  }
});

export const candidateFilterRequestSchema = z.object({
  filters: candidateFilterInputSchema,
}).strict();

export type CandidateFilterInput = z.input<typeof candidateFilterInputSchema>;

const moneyPairs = [
  ["assetMin", "assetMinCents"], ["assetMax", "assetMaxCents"],
  ["revenueMin", "revenueMinCents"], ["revenueMax", "revenueMaxCents"],
  ["expenseMin", "expenseMinCents"], ["expenseMax", "expenseMaxCents"],
] as const;
const signedMoneyPairs = [
  ["balanceMin", "balanceMinCents"], ["balanceMax", "balanceMaxCents"],
] as const;

export function parseCandidateFilterInput(input: unknown): CandidateFilters {
  const parsed = candidateFilterInputSchema.parse(input);
  const filters = { ...parsed } as Record<string, unknown>;
  for (const [wireKey, domainKey] of moneyPairs) {
    const value = parsed[wireKey];
    delete filters[wireKey];
    if (value !== undefined) filters[domainKey] = reaisToCents(value)!;
  }
  for (const [wireKey, domainKey] of signedMoneyPairs) {
    const value = parsed[wireKey];
    delete filters[wireKey];
    if (value !== undefined) filters[domainKey] = signedReaisToCents(value)!;
  }
  return canonicalizeCandidateFilters(filters as CandidateFilters);
}

export function toCandidateFilterInput(filters: CandidateFilters): CandidateFilterInput {
  const canonical = canonicalizeCandidateFilters(filters);
  const wire = { ...canonical } as Record<string, unknown>;
  for (const [wireKey, domainKey] of moneyPairs) {
    const value = filters[domainKey];
    delete wire[domainKey];
    if (value !== undefined) {
      const encoded = centsToReais(value);
      if (encoded === undefined) throw new RangeError(`${domainKey} is outside PostgreSQL bigint range`);
      wire[wireKey] = encoded;
    }
  }
  for (const [wireKey, domainKey] of signedMoneyPairs) {
    const value = filters[domainKey];
    delete wire[domainKey];
    if (value !== undefined) {
      const encoded = signedCentsToReais(value);
      if (encoded === undefined) throw new RangeError(`${domainKey} is outside PostgreSQL bigint range`);
      wire[wireKey] = encoded;
    }
  }
  return candidateFilterInputSchema.parse(wire);
}

export interface CandidateQueryScope {
  userId?: string;
}

type CandidateFilterRequestRead =
  | { filters: CandidateFilters; scope: CandidateQueryScope }
  | { error: "AUTH_REQUIRED" | "INVALID_FILTER_REQUEST" | "REQUEST_TOO_LARGE" };

async function readBoundedJson(request: Request): Promise<{ body: unknown } | { error: "INVALID_FILTER_REQUEST" | "REQUEST_TOO_LARGE" }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_REQUEST_BYTES) {
    return { error: "REQUEST_TOO_LARGE" };
  }
  const reader = request.body?.getReader();
  if (!reader) return { error: "INVALID_FILTER_REQUEST" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { error: "REQUEST_TOO_LARGE" };
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { body: JSON.parse(new TextDecoder().decode(joined)) };
  } catch {
    return { error: "INVALID_FILTER_REQUEST" };
  } finally {
    reader.releaseLock();
  }
}

export async function readCandidateFilterRequest(
  request: Request,
  users: UserRepository,
): Promise<CandidateFilterRequestRead> {
  const user = await currentUserFromCookie(request.headers.get("cookie"), users);
  const body = await readBoundedJson(request);
  if ("error" in body) return body;
  const parsed = candidateFilterRequestSchema.safeParse(body.body);
  if (!parsed.success) return { error: "INVALID_FILTER_REQUEST" };
  const filters = parseCandidateFilterInput(parsed.data.filters);
  if (filters.followedOnly && !user) return { error: "AUTH_REQUIRED" };
  return { filters, scope: user ? { userId: user.id } : {} };
}
