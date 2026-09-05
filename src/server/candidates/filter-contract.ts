import { z } from "zod";

import { currentUserFromCookie } from "#/auth/current-user";
import type { UserRepository } from "#/auth/user-repository";
import { CandidateOffice } from "#/domain/electoral";
import type { CandidateFilters } from "#/server/candidates/read-models";
import { centsToReais, reaisToCents } from "#/server/candidates/search-params";

const MAX_FILTER_VALUES = 20;
const MAX_TEXT_LENGTH = 200;
const MAX_REQUEST_BYTES = 65_536;
const regionValues = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO", "BR",
] as const;
const orderValues = [
  "name", "number", "updated", "assets_desc", "revenue_desc", "expenses_desc", "projects_desc", "votes_desc",
] as const;

const text = z.string().trim().min(1).max(MAX_TEXT_LENGTH);
const values = <T extends z.ZodType>(schema: T) => z.array(schema).min(1).max(MAX_FILTER_VALUES);
const nonNegativeInteger = z.number().int().safe().nonnegative();
const positiveInteger = z.number().int().safe().positive();
const money = z.string().refine((value) => reaisToCents(value) !== undefined, "Invalid non-negative reais value");

export const candidateFilterInputSchema = z.object({
  query: text.optional(),
  electionYears: values(z.number().int().min(2026).max(9999)).optional(),
  offices: values(CandidateOffice).optional(),
  regions: values(z.enum(regionValues)).optional(),
  parties: values(text).optional(),
  rounds: values(z.number().int().min(1).max(9)).optional(),
  statuses: values(text).optional(),
  federations: values(text).optional(),
  coalitions: values(text).optional(),
  ageMin: nonNegativeInteger.max(150).optional(),
  ageMax: nonNegativeInteger.max(150).optional(),
  genders: values(text).optional(),
  races: values(text).optional(),
  educations: values(text).optional(),
  occupations: values(text).optional(),
  declaredAssets: z.enum(["yes", "no"]).optional(),
  assetMin: money.optional(),
  assetMax: money.optional(),
  assetCountMin: nonNegativeInteger.max(1_000_000).optional(),
  assetCountMax: nonNegativeInteger.max(1_000_000).optional(),
  assetCategories: values(text).optional(),
  revenueMin: money.optional(),
  revenueMax: money.optional(),
  expenseMin: money.optional(),
  expenseMax: money.optional(),
  balanceMin: money.optional(),
  balanceMax: money.optional(),
  fundingKinds: values(z.enum(["public", "private", "own"])).optional(),
  hasPhoto: z.boolean().optional(),
  hasSocial: z.boolean().optional(),
  hasGovernmentPlan: z.boolean().optional(),
  hasCertificates: z.boolean().optional(),
  hasFinance: z.boolean().optional(),
  hasConfirmedLawmaker: z.boolean().optional(),
  lawmakerHouses: values(z.enum(["camara", "senado"])).optional(),
  activeMandate: z.boolean().optional(),
  topics: values(text).optional(),
  followedOnly: z.boolean().optional(),
  order: z.enum(orderValues).optional(),
  page: positiveInteger.max(100_000).optional(),
  pageSize: positiveInteger.max(50).optional(),
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
    ["expenseMin", "expenseMax"], ["balanceMin", "balanceMax"],
  ] as const) {
    const minimum = input[minimumKey] === undefined ? undefined : reaisToCents(input[minimumKey]);
    const maximum = input[maximumKey] === undefined ? undefined : reaisToCents(input[maximumKey]);
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      context.addIssue({ code: "custom", path: [maximumKey], message: `${minimumKey} must not exceed ${maximumKey}` });
    }
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
  return filters as CandidateFilters;
}

export function toCandidateFilterInput(filters: CandidateFilters): CandidateFilterInput {
  const wire = { ...filters } as Record<string, unknown>;
  for (const [wireKey, domainKey] of moneyPairs) {
    const value = filters[domainKey];
    delete wire[domainKey];
    if (value !== undefined) {
      const encoded = centsToReais(value);
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
