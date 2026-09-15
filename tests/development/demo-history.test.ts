import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";

import { assertLocalDisposableDatabaseUrl } from "#/development/database-url";
import { seedDemo } from "#/development/seed-demo";
import * as schema from "#/server/db/schema";

const url = assertLocalDisposableDatabaseUrl(
  process.env.DEMO_TEST_DATABASE_URL ?? "postgres://app:app@127.0.0.1:5435/legislativo_test_demo",
  "test_demo",
);
const connection = postgres(url, { max: 1, onnotice: () => {} });
const database = drizzle(connection, { schema });

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
  await seedDemo(database);
  await database.update(schema.billHydrationState).set({
    status: "complete",
    detailsCheckedAt: new Date("2000-01-01T00:00:00Z"),
  }).where(eq(schema.billHydrationState.billId, "00000000-0000-4000-8000-000000000001"));
});
afterAll(() => connection.end());

it("does not send synthetic IDs to official APIs after the detail cache expires", () => {
  const code = `
    let networkCalls = 0;
    globalThis.fetch = async () => { networkCalls++; throw new Error("Network forbidden in demo"); };
    const { prepareProjectHistory } = await import("#/server/legislative/prepare-project-history");
    const result = await prepareProjectHistory("camara", "demo-001");
    const { sql } = await import("#/server/db/client");
    await sql.end();
    console.log(JSON.stringify({ status: result.status, networkCalls }));
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", code], {
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, DATABASE_URL: url, HTTP_MAX_ATTEMPTS: "1", GEO_PROVIDER: "none" },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ status: "cached", networkCalls: 0 });
});
