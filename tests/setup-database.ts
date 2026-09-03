import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import * as schema from "#/server/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for database integration tests");
}

export const testSql = postgres(process.env.DATABASE_URL, { max: 1 });
export const testDb = drizzle(testSql, { schema });

export async function migrateTestDatabase() {
  await migrate(testDb, { migrationsFolder: "drizzle" });
}

export async function truncateLegislativeTables() {
  await testDb.execute(sql`
    truncate table
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
