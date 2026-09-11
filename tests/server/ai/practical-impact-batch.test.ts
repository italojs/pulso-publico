import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { aiSummaryBatchItems, bills } from "#/server/db/schema";
import { preparePracticalImpactBatch } from "#/server/ai/practical-impact-batch";
import { migrateTestDatabase, testDb, testSql, truncateLegislativeTables } from "../../setup-database.ts";

const promptVersion = "plain-language-full-text-v3";

beforeAll(migrateTestDatabase);
beforeEach(truncateLegislativeTables);
afterAll(() => testSql.end());

async function seedBill(externalId: string, presentedAt: string) {
  await testDb.insert(bills).values({
    source: "camara",
    externalId,
    officialCode: `PL ${externalId}/2026`,
    officialTitle: `Projeto ${externalId}`,
    officialSummary: "Texto oficial de teste.",
    originHouse: "camara",
    currentHouse: "camara",
    statusLabel: "Em análise",
    officialUrl: `https://example.test/${externalId}`,
    presentedAt: new Date(presentedAt),
    checkedAt: new Date("2026-09-11T12:00:00.000Z"),
  });
}

describe("practical impact batch", () => {
  it("freezes the newest requested bill IDs and ignores bills that arrive later", async () => {
    await seedBill("older", "2026-01-01T12:00:00.000Z");
    await seedBill("middle", "2026-02-01T12:00:00.000Z");
    await seedBill("newest", "2026-03-01T12:00:00.000Z");

    await expect(preparePracticalImpactBatch(testDb, { limit: 2, promptVersion })).resolves.toEqual({
      selected: 2,
      inserted: 2,
      existing: 0,
    });
    await seedBill("later", "2026-04-01T12:00:00.000Z");

    await expect(preparePracticalImpactBatch(testDb, { limit: 2, promptVersion })).resolves.toEqual({
      selected: 2,
      inserted: 0,
      existing: 2,
    });
    const items = await testDb.select({ rank: aiSummaryBatchItems.rank, billId: aiSummaryBatchItems.billId })
      .from(aiSummaryBatchItems)
      .orderBy(aiSummaryBatchItems.rank);
    const selected = await testDb.select({ id: bills.id, externalId: bills.externalId }).from(bills);
    const byId = new Map(selected.map((bill) => [bill.id, bill.externalId]));

    expect(items.map((item) => [item.rank, byId.get(item.billId)])).toEqual([[1, "newest"], [2, "middle"]]);
  });
});
