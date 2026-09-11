import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { aiSummaries, aiSummaryBatchItems, bills } from "#/server/db/schema";
import { preparePracticalImpactBatch, verifyPracticalImpactBatch } from "#/server/ai/practical-impact-batch";
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

  it("reports only completed items whose practical explanation satisfies the public contract", async () => {
    await seedBill("complete", "2026-03-01T12:00:00.000Z");
    await seedBill("missing-impact", "2026-02-01T12:00:00.000Z");
    await preparePracticalImpactBatch(testDb, { limit: 2, promptVersion });

    const frozen = await testDb.select().from(aiSummaryBatchItems).orderBy(aiSummaryBatchItems.rank);
    const complete = frozen.find((item) => item.rank === 1)!;
    const missingImpact = frozen.find((item) => item.rank === 2)!;

    await testDb.insert(aiSummaries).values([
      {
        billId: complete.billId,
        friendlyTitle: "Explicação simples para o projeto completo",
        shortDescription: "Esta é uma explicação clara e suficientemente longa para que uma pessoa entenda o projeto em linguagem simples.",
        practicalImpact: "Na prática: serviços e pessoas afetadas passariam a seguir a nova regra caso o projeto seja aprovado e entre em vigor.",
        model: "gpt-5.6-terra",
        promptVersion,
        sourceFingerprint: "complete",
        generatedAt: new Date(),
      },
      {
        billId: missingImpact.billId,
        friendlyTitle: "Explicação sem impacto prático",
        shortDescription: "Esta é uma explicação clara e suficientemente longa para que uma pessoa entenda o projeto em linguagem simples.",
        practicalImpact: null,
        model: "gpt-5.6-terra",
        promptVersion,
        sourceFingerprint: "missing-impact",
        generatedAt: new Date(),
      },
    ]);
    await testDb.update(aiSummaryBatchItems).set({ status: "completed" })
      .where(inArray(aiSummaryBatchItems.id, [complete.id, missingImpact.id]));

    await expect(verifyPracticalImpactBatch(testDb, { promptVersion })).resolves.toEqual({
      total: 2,
      completed: 2,
      pending: 0,
      processing: 0,
      needsReview: 0,
      failed: 0,
      invalidCompleted: 1,
    });
  });
});
