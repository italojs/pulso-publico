import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AiSummaryRepository } from "#/ai/repository";
import { generateSummaryBatch, generateTopFeedSummaryBatch } from "#/jobs/generate-summaries";
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
        shortDescription: "A proposta altera a jornada semanal e a organização dos dias de descanso para os trabalhadores abrangidos pela nova regra.",
        practicalImpact: "Na prática: trabalhadores abrangidos passariam a ter uma escala com dois dias consecutivos de descanso, se o texto entrar em vigor.",
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

  it("generates only missing summaries inside the requested top-feed window", async () => {
    const checkedAt = new Date("2026-09-03T12:00:00Z");
    const inserted = await testDb.insert(bills).values([
      {
        source: "camara",
        externalId: "older",
        officialCode: "PL 1/2026",
        officialTitle: "Projeto de Lei nº 1, de 2026",
        officialSummary: "Projeto mais antigo fora do recorte.",
        originHouse: "camara",
        currentHouse: "camara",
        statusLabel: "Em análise",
        officialUrl: "https://example.com/older",
        presentedAt: new Date("2026-01-01T12:00:00Z"),
        checkedAt,
      },
      {
        source: "camara",
        externalId: "newest",
        officialCode: "PL 3/2026",
        officialTitle: "Projeto de Lei nº 3, de 2026",
        officialSummary: "Projeto mais recente do recorte.",
        originHouse: "camara",
        currentHouse: "camara",
        statusLabel: "Em análise",
        officialUrl: "https://example.com/newest",
        presentedAt: new Date("2026-03-01T12:00:00Z"),
        checkedAt,
      },
      {
        source: "senado",
        externalId: "middle",
        officialCode: "PL 2/2026",
        officialTitle: "Projeto de Lei nº 2, de 2026",
        officialSummary: "Segundo projeto dentro do recorte.",
        originHouse: "senado",
        currentHouse: "senado",
        statusLabel: "Em análise",
        officialUrl: "https://example.com/middle",
        presentedAt: new Date("2026-02-01T12:00:00Z"),
        checkedAt,
      },
    ]).returning();
    const newest = inserted.find((bill) => bill.externalId === "newest");
    if (!newest) throw new Error("newest bill not seeded");

    const provider = {
      model: "test-model",
      generate: vi.fn().mockImplementation(async (input: { officialCode: string }) => ({
        friendlyTitle: `Explicação simples para ${input.officialCode}`,
        shortDescription: "Descrição simples, neutra e baseada somente nos dados oficiais fornecidos para explicar a proposta a pessoas leigas em política.",
        practicalImpact: "Na prática: o texto alteraria as regras aplicáveis ao caso descrito, caso seja aprovado e passe a valer como lei.",
      })),
    };
    const repository = new AiSummaryRepository(testDb);

    await expect(generateTopFeedSummaryBatch(repository, provider, 1)).resolves.toMatchObject({
      selected: 1,
      generated: 1,
    });
    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ officialCode: "PL 3/2026" }));

    await expect(generateTopFeedSummaryBatch(repository, provider, 1)).resolves.toMatchObject({
      selected: 0,
      generated: 0,
    });
    expect(await testDb.select().from(aiSummaries)).toEqual([
      expect.objectContaining({ billId: newest.id }),
    ]);
  });
});
