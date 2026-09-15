import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { bills } from "#/server/db/schema";
import { countPublicBills, listPublicBills } from "#/server/public/queries";
import { migrateTestDatabase, testDb, testSql, truncateLegislativeTables } from "../setup-database.ts";

beforeAll(migrateTestDatabase);
beforeEach(async () => {
  await truncateLegislativeTables();
  const instants = [
    "2026-09-04T02:59:59.999Z", // Immediately before the Brazilian calendar day.
    "2026-09-04T03:00:00.000Z", // First instant of that day.
    "2026-09-05T02:59:59.999Z", // Last millisecond of that day.
    "2026-09-05T03:00:00.000Z", // First instant of the next day.
  ];
  await testDb.insert(bills).values(instants.map((instant, index) => ({
    source: "camara" as const,
    externalId: `date-boundary-${index}`,
    officialCode: `FIXTURE ${index}`,
    officialTitle: "Projeto fictício para teste de limite de data",
    officialSummary: "Exemplo sintético, sem registro político real.",
    originHouse: "camara" as const,
    statusLabel: "Demonstração fictícia",
    officialUrl: "https://example.invalid/date-boundary",
    presentedAt: new Date(instant),
    checkedAt: new Date("2026-09-15T12:00:00Z"),
  })));
});
afterAll(() => testSql.end());

it.each(["UTC", "America/Sao_Paulo", "Asia/Tokyo"])(
  "keeps Brazilian calendar filters independent of PostgreSQL timezone %s",
  async (timezone) => {
    await testDb.transaction(async (transaction) => {
      await transaction.execute(sql`select set_config('TimeZone', ${timezone}, true)`);
      for (const filters of [
        { presentedStart: "2026-09-04", presentedEnd: "2026-09-04" },
        { activityStart: "2026-09-04", activityEnd: "2026-09-04" },
      ]) {
        const page = await listPublicBills(transaction, filters);
        expect(page.items.map((item) => item.officialCode).sort()).toEqual(["FIXTURE 1", "FIXTURE 2"]);
        expect(page.total).toBe(2);
        expect(await countPublicBills(transaction, filters)).toBe(2);
      }
    });
  },
);
