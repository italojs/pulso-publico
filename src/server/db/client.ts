import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "#/server/config";
import * as schema from "#/server/db/schema";

export const sql = postgres(env.DATABASE_URL, { max: 10 });
export const db = drizzle(sql, { schema });
