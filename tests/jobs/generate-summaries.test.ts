import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AiSummaryRepository } from "#/ai/repository";
import { generateSummaryBatch } from "#/jobs/generate-summaries";
import { aiSummaries, bills } from "#/server/db/schema";
import { migrateTestDatabase, testDb, testSql, truncateLegislativeTables } from "../setup-database.ts";

beforeAll(migrateTestDatabase);
beforeEach(truncateLegislativeTables);
afterAll(() => testSql.end());

describe("summary generation job", () => {
  it("generates once and regenerates only after an official field changes", async () => {
    const [bill] = await testDb.insert(bills).values({
      source: "camara",
      externalId: "9501",
      officialCode: "PEC 8/2025",
      officialTitle: "Proposta de Emenda à Constituição nº 8, de 2025",
      officialSummary: "Reduz a jornada semanal e altera a escala de trabalho.",
      originHouse: "camara",
      currentHouse: "camara",
      statusLabel: "Em análise",
      officialUrl: "https://example.com/501",
      checkedAt: new Date("2026-09-03T12:00:00Z"),
    }).returning();
    if (!bill) throw new Error("bill not seeded");

    const provider = {
      model: "test-model",
      generate: vi.fn().mockResolvedValue({
        friendlyTitle: "Jornada semanal com nova escala de descanso",
        shortDescription: "A proposta altera a jornada semanal e a organização dos dias de descanso.",
      }),
    };
    const repository = new AiSummaryRepository(testDb);

    await expect(generateSummaryBatch(repository, provider, 10)).resolves.toMatchObject({ generated: 1, failed: 0 });
    await expect(generateSummaryBatch(repository, provider, 10)).resolves.toMatchObject({ selected: 0, generated: 0 });
    expect(provider.generate).toHaveBeenCalledTimes(1);

    await testDb.update(bills).set({ officialSummary: "Ementa oficial corrigida." });
    await expect(generateSummaryBatch(repository, provider, 10)).resolves.toMatchObject({ generated: 1 });
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(await testDb.select().from(aiSummaries)).toHaveLength(1);
  });
});
