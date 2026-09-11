import { asc, count, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { aiSummaryBatchItems, bills } from "#/server/db/schema";
import type * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;

export interface PreparePracticalImpactBatchOptions {
  limit: number;
  promptVersion: string;
}

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
    .orderBy(
      sql`greatest(
        (select max("movements"."occurred_at") from "movements" where "movements"."bill_id" = "bills"."id"),
        (select max("vote_events"."occurred_at") from "vote_events" where "vote_events"."bill_id" = "bills"."id"),
        ${bills.presentedAt}
      ) desc nulls last`,
      asc(bills.id),
    )
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
