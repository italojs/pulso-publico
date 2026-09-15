import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { assertLocalDisposableDatabaseUrl } from "#/development/database-url";
import * as schema from "#/server/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for database integration tests");
}

export const testSql = postgres(assertLocalDisposableDatabaseUrl(process.env.DATABASE_URL, "test"), { max: 1 });
export const testDb = drizzle(testSql, { schema });

export async function migrateTestDatabase() {
  await migrate(testDb, { migrationsFolder: "drizzle" });
}

export async function truncateLegislativeTables() {
  await testDb.execute(sql`
    truncate table
      electoral_media_blobs,
      historical_collection_runs,
      historical_collection_tasks,
      bill_hydration_state,
      historical_import_checkpoints,
      followed_candidates,
      candidate_lawmaker_links,
      candidate_documents,
      candidate_government_plans,
      candidate_social_links,
      candidate_campaign_totals,
      candidate_assets,
      electoral_candidates,
      electoral_sync_runs,
      push_subscriptions,
      user_alerts,
      alert_events,
      followed_lawmakers,
      followed_bills,
      sessions,
      users,
      ai_summaries,
      individual_votes,
      vote_events,
      movements,
      bill_topics,
      bill_authors,
      bills,
      lawmakers,
      sync_checkpoints,
      source_health
    restart identity cascade
  `);
}
