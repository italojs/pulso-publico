import { and, asc, count, eq, notExists, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { aiSummaries, aiSummaryBatchItems, bills } from "#/server/db/schema";
import type * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;

export interface PreparePracticalImpactBatchOptions {
  limit: number;
  promptVersion: string;
}

const billActivityOrder = [
  sql`greatest(
    (select max("movements"."occurred_at") from "movements" where "movements"."bill_id" = "bills"."id"),
    (select max("vote_events"."occurred_at") from "vote_events" where "vote_events"."bill_id" = "bills"."id"),
    ${bills.presentedAt}
  ) desc nulls last`,
  asc(bills.id),
] as const;

export async function preparePracticalImpactBatch(
  database: Database,
  { limit, promptVersion }: PreparePracticalImpactBatchOptions,
) {
  const [stored] = await database
    .select({ value: count() })
    .from(aiSummaryBatchItems)
    .where(eq(aiSummaryBatchItems.promptVersion, promptVersion));
  const existing = stored?.value ?? 0;
  if (existing > 0) return { selected: existing, inserted: 0, existing };

  const selected = await database
    .select({ id: bills.id })
    .from(bills)
    .orderBy(...billActivityOrder)
    .limit(limit);

  if (selected.length > 0) {
    await database
      .insert(aiSummaryBatchItems)
      .values(selected.map((bill, index) => ({
        billId: bill.id,
        promptVersion,
        rank: index + 1,
      })))
      .onConflictDoNothing();
  }

  return { selected: selected.length, inserted: selected.length, existing: 0 };
}

export async function appendPracticalImpactBatch(
  database: Database,
  { limit, promptVersion }: PreparePracticalImpactBatchOptions,
) {
  const [stored] = await database
    .select({ value: count() })
    .from(aiSummaryBatchItems)
    .where(eq(aiSummaryBatchItems.promptVersion, promptVersion));
  const existing = stored?.value ?? 0;

  const [rank] = await database
    .select({ value: sql<number>`coalesce(max(${aiSummaryBatchItems.rank}), 0)` })
    .from(aiSummaryBatchItems)
    .where(eq(aiSummaryBatchItems.promptVersion, promptVersion));
  const startingRank = Number(rank?.value ?? 0) + 1;

  const selected = await database
    .select({ id: bills.id })
    .from(bills)
    .where(notExists(
      database
        .select({ one: sql`1` })
        .from(aiSummaryBatchItems)
        .where(and(
          eq(aiSummaryBatchItems.billId, bills.id),
          eq(aiSummaryBatchItems.promptVersion, promptVersion),
        )),
    ))
    .orderBy(...billActivityOrder)
    .limit(limit);

  if (selected.length > 0) {
    await database
      .insert(aiSummaryBatchItems)
      .values(selected.map((bill, index) => ({
        billId: bill.id,
        promptVersion,
        rank: startingRank + index,
      })))
      .onConflictDoNothing();
  }

  return {
    selected: selected.length,
    inserted: selected.length,
    existing,
    startingRank,
  };
}

export interface VerifyPracticalImpactBatchOptions {
  promptVersion: string;
}

function hasValidLength(value: string | null, minimum: number, maximum: number) {
  const length = value?.trim().length ?? 0;
  return length >= minimum && length <= maximum;
}

export async function verifyPracticalImpactBatch(
  database: Database,
  { promptVersion }: VerifyPracticalImpactBatchOptions,
) {
  const rows = await database
    .select({
      status: aiSummaryBatchItems.status,
      summaryPromptVersion: aiSummaries.promptVersion,
      friendlyTitle: aiSummaries.friendlyTitle,
      shortDescription: aiSummaries.shortDescription,
      practicalImpact: aiSummaries.practicalImpact,
    })
    .from(aiSummaryBatchItems)
    .leftJoin(aiSummaries, eq(aiSummaries.billId, aiSummaryBatchItems.billId))
    .where(eq(aiSummaryBatchItems.promptVersion, promptVersion));

  const statuses = {
    total: rows.length,
    completed: 0,
    pending: 0,
    processing: 0,
    needsReview: 0,
    failed: 0,
    invalidCompleted: 0,
  };

  for (const row of rows) {
    switch (row.status) {
      case "completed":
        statuses.completed += 1;
        if (
          row.summaryPromptVersion !== promptVersion
          || !hasValidLength(row.friendlyTitle, 8, 120)
          || !hasValidLength(row.shortDescription, 80, 420)
          || !hasValidLength(row.practicalImpact, 80, 520)
          || !row.practicalImpact?.trim().startsWith("Na prática:")
        ) {
          statuses.invalidCompleted += 1;
        }
        break;
      case "pending":
        statuses.pending += 1;
        break;
      case "processing":
        statuses.processing += 1;
        break;
      case "needs_review":
        statuses.needsReview += 1;
        break;
      case "failed":
        statuses.failed += 1;
        break;
    }
  }

  return statuses;
}
