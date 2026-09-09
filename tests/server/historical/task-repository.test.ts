import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { HISTORICAL_PHASES } from "#/domain/historical-collection";
import { bills, historicalCollectionTasks } from "#/server/db/schema";
import { HistoricalTaskRepository } from "#/server/historical/task-repository";
import {
  migrateTestDatabase,
  testDb,
  testSql,
  truncateLegislativeTables,
} from "../../setup-database.ts";

describe("HistoricalTaskRepository", () => {
  const repository = new HistoricalTaskRepository(testDb);

  beforeAll(migrateTestDatabase);
  beforeEach(truncateLegislativeTables);
  afterAll(() => testSql.end());

  it("seeds every phase and year idempotently", async () => {
    const input = {
      fromYear: 1946,
      throughYear: 1947,
      sources: ["camara", "senado"] as const,
    };

    expect(await repository.seedRange(input)).toBe(28);
    expect(await repository.seedRange(input)).toBe(0);
    expect(await repository.listStatus()).toHaveLength(
      2 * 2 * HISTORICAL_PHASES.length,
    );
  });

  it("leases only one task per source and recovers an expired lease", async () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    await repository.seedRange({
      fromYear: 1946,
      throughYear: 1947,
      sources: ["camara"],
    });

    const first = await repository.reserveNext("worker-a", now, 60_000);
    expect(first).toMatchObject({
      year: 1947,
      phase: "catalog",
      leaseOwner: "worker-a",
    });
    expect(await repository.reserveNext("worker-b", now, 60_000)).toBeNull();
    expect(
      await repository.reserveNext(
        "worker-b",
        new Date(now.getTime() + 60_001),
        60_000,
      ),
    ).toMatchObject({ id: first?.id, leaseOwner: "worker-b", attempts: 2 });
  });

  it("unlocks the next phase only after its predecessor completes", async () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    await repository.seedRange({ fromYear: 2026, throughYear: 2026, sources: ["senado"] });

    const catalog = await repository.reserveNext("worker", now, 60_000);
    expect(catalog?.phase).toBe("catalog");
    await repository.complete(catalog!.id, "worker", now);

    expect(await repository.reserveNext("worker", now, 60_000)).toMatchObject({
      phase: "authors_topics",
    });
  });

  it("rolls back entity writes and cursor progress in the same transaction", async () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    await repository.seedRange({ fromYear: 2026, throughYear: 2026, sources: ["camara"] });
    const task = await repository.reserveNext("worker", now, 60_000);

    await expect(repository.commitBatch(
      task!,
      { cursor: "bill-100", recordsRead: 1, recordsPersisted: 1 },
      async (transaction) => {
        await transaction.insert(bills).values({
          source: "camara",
          externalId: "bill-100",
          officialCode: "PL 100/2026",
          officialTitle: "Projeto de teste",
          originHouse: "camara",
          statusLabel: "Apresentado",
          officialUrl: "https://example.test/bill-100",
          checkedAt: now,
        });
        throw new Error("simulated persistence failure");
      },
    )).rejects.toThrow("simulated persistence failure");

    expect(await testDb.select().from(bills).where(eq(bills.externalId, "bill-100")))
      .toHaveLength(0);
    expect(await repository.get(task!.id)).toMatchObject({
      cursor: null,
      recordsRead: 0,
      recordsPersisted: 0,
      status: "running",
    });
  });

  it("does not let a stale worker commit a recovered task", async () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    await repository.seedRange({ fromYear: 2026, throughYear: 2026, sources: ["camara"] });
    const stale = await repository.reserveNext("worker-a", now, 1_000);
    await repository.reserveNext("worker-b", new Date(now.getTime() + 1_001), 60_000);

    await expect(repository.commitBatch(
      stale!,
      { cursor: "stale", recordsRead: 1, recordsPersisted: 0 },
      async () => undefined,
    )).rejects.toThrow("Historical task lease is no longer owned by this worker");

    const [stored] = await testDb.select().from(historicalCollectionTasks)
      .where(eq(historicalCollectionTasks.id, stale!.id));
    expect(stored?.cursor).toBeNull();
  });
});
