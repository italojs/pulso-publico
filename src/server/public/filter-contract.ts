import { z } from "zod";

import { currentUserFromCookie } from "#/auth/current-user";
import type { UserRepository } from "#/auth/user-repository";
import type { PublicBillScope } from "#/server/public/queries";
import type { PublicBillFilters } from "#/server/public/read-models";

const MAX_FILTER_VALUES = 20;
const MAX_TEXT_LENGTH = 200;

const sourceValues = ["camara", "senado"] as const;
const originHouseValues = ["camara", "senado", "congresso"] as const;
const currentHouseValues = [...originHouseValues, "nao_informada"] as const;
const stageValues = [
  "presented",
  "committees",
  "ready_for_vote",
  "voted",
  "sanction_or_veto",
  "closed",
  "unclassified",
] as const;
const voteKindValues = ["nominal", "secret", "non_nominal"] as const;
const voteResultValues = ["approved", "rejected", "other", "unavailable"] as const;
const regionValues = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
  "nao_informada",
] as const;
const orderValues = ["updated", "presented_desc", "presented_asc", "most_movements", "most_votes"] as const;

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === (month ?? 0) - 1
    && date.getUTCDate() === day;
}

const text = z.string().trim().min(1).max(MAX_TEXT_LENGTH);
const date = z.string().refine(validIsoDate, "Expected a calendar ISO date");
const positiveInteger = z.number().int().safe().positive();
const filterValues = <T extends z.ZodType>(schema: T) => z.array(schema).min(1).max(MAX_FILTER_VALUES);

export const publicBillFiltersSchema = z.object({
  query: text.optional(),
  proposalTypes: filterValues(z.string().regex(/^[A-Z]{2,10}$/)).optional(),
  proposalNumber: positiveInteger.optional(),
  yearFrom: positiveInteger.optional(),
  yearTo: positiveInteger.optional(),
  sources: filterValues(z.enum(sourceValues)).optional(),
  originHouses: filterValues(z.enum(originHouseValues)).optional(),
  currentHouses: filterValues(z.enum(currentHouseValues)).optional(),
  stages: filterValues(z.enum(stageValues)).optional(),
  statuses: filterValues(text).optional(),
  presentedStart: date.optional(),
  presentedEnd: date.optional(),
  activityStart: date.optional(),
  activityEnd: date.optional(),
  votePresence: z.enum(["with", "without"]).optional(),
  voteKinds: filterValues(z.enum(voteKindValues)).optional(),
  individualVoteAvailability: z.enum(["available", "unavailable"]).optional(),
  voteResults: filterValues(z.enum(voteResultValues)).optional(),
  voteHouses: filterValues(z.enum(originHouseValues)).optional(),
  topics: filterValues(text).optional(),
  authors: filterValues(text).optional(),
  parties: filterValues(text).optional(),
  regions: filterValues(z.enum(regionValues)).optional(),
  followedOnly: z.boolean().optional(),
  page: positiveInteger.max(100_000).optional(),
  pageSize: positiveInteger.max(50).optional(),
  order: z.enum(orderValues).optional(),
}).strict().superRefine((filters, context) => {
  if (filters.yearFrom !== undefined && filters.yearTo !== undefined && filters.yearFrom > filters.yearTo) {
    context.addIssue({ code: "custom", message: "yearFrom must not be after yearTo", path: ["yearTo"] });
  }
  if (filters.presentedStart && filters.presentedEnd && filters.presentedStart > filters.presentedEnd) {
    context.addIssue({ code: "custom", message: "presentedStart must not be after presentedEnd", path: ["presentedEnd"] });
  }
  if (filters.activityStart && filters.activityEnd && filters.activityStart > filters.activityEnd) {
    context.addIssue({ code: "custom", message: "activityStart must not be after activityEnd", path: ["activityEnd"] });
  }
});

const billReference = z.object({
  source: z.enum(sourceValues),
  externalId: z.string().min(1).max(MAX_TEXT_LENGTH),
}).strict();

export const filterRequest = z.object({
  filters: publicBillFiltersSchema,
  anonymousBillKeys: z.array(billReference).max(200).default([]),
}).strict();

type FilterRequest = z.infer<typeof filterRequest>;

function anonymousScope(keys: FilterRequest["anonymousBillKeys"]): PublicBillScope {
  const seen = new Set<string>();
  const anonymousBillKeys = keys.filter((key) => {
    const identity = `${key.source}:${key.externalId}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  return { anonymousBillKeys };
}

export async function readPublicFilterRequest(request: Request, users: UserRepository): Promise<{
  filters: PublicBillFilters;
  scope: PublicBillScope;
} | null> {
  const user = await currentUserFromCookie(request.headers.get("cookie"), users);
  const parsed = filterRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return null;

  return {
    filters: parsed.data.filters,
    scope: user ? { userId: user.id } : anonymousScope(parsed.data.anonymousBillKeys),
  };
}
