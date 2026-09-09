import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "#/server/db/schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
