import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { assertLocalDisposableDatabaseUrl } from "#/development/database-url";
import { seedDemo } from "#/development/seed-demo";
import * as schema from "#/server/db/schema";

let connection: ReturnType<typeof postgres> | undefined;
try {
  if (process.env.NODE_ENV === "production") throw new Error("Demo is not allowed in production");
  // Deliberately do not load .env or fall back to DATABASE_URL.
  const url = assertLocalDisposableDatabaseUrl(process.env.DEMO_DATABASE_URL ?? "", "demo");
  connection = postgres(url, { max: 1 });
  console.log(JSON.stringify(await seedDemo(drizzle(connection, { schema }))));
} catch {
  console.error(JSON.stringify({ status: "failed", code: "DEMO_SETUP_ERROR", help: "Set DEMO_DATABASE_URL to a migrated loopback PostgreSQL database ending in _demo. Production is not allowed." }));
  process.exitCode = 1;
} finally {
  await connection?.end({ timeout: 5 });
}
