import { describe, expect, it } from "vitest";

import type { HistoricalTask } from "#/domain/historical-collection";
import {
  classifyStorage,
  readHistoricalStatus,
} from "#/jobs/historical-status";
import type { Database } from "#/server/db/types";

const fixedDate = new Date("2026-09-09T12:00:00.000Z");

function task(overrides: Partial<HistoricalTask> = {}): HistoricalTask {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    source: "camara",
    year: 2026,
    phase: "catalog",
    cursor: "page:2:https://dadosabertos.camara.leg.br/secret",
    status: "running",
    attempts: 1,
    recordsRead: 10,
    recordsPersisted: 9,
    leaseOwner: "worker-with-secret",
    leaseExpiresAt: fixedDate,
    nextAttemptAt: null,
    lastErrorCode: null,
    startedAt: fixedDate,
    completedAt: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    ...overrides,
  };
}

describe("classifyStorage", () => {
  it("classifies the configured capacity thresholds", () => {
    expect(classifyStorage(69)).toBe("ok");
    expect(classifyStorage(70)).toBe("warning");
    expect(classifyStorage(80)).toBe("critical");
    expect(classifyStorage(90)).toBe("stop");
  });
});

describe("readHistoricalStatus", () => {
  it("returns useful progress without exposing credentials, leases or upstream URLs", async () => {
    const database = {
      execute: async () => [{ usedBytes: "21000000000" }],
    } as unknown as Database;
    const tasks = [
      task(),
      task({
        id: "00000000-0000-4000-8000-000000000002",
        source: "senado",
        year: 2025,
        phase: "validate",
        cursor: "https://legis.senado.leg.br/private",
        status: "complete",
        completedAt: fixedDate,
      }),
      task({
        id: "00000000-0000-4000-8000-000000000003",
        source: "senado",
        year: 2024,
        phase: "movements",
        cursor: null,
        status: "failed",
        lastErrorCode: "UPSTREAM_INVALID",
      }),
    ];

    const report = await readHistoricalStatus(database, 30_000_000_000n, {
      listStatus: async () => tasks,
    });

    expect(report.storage).toEqual({
      usedBytes: "21000000000",
      capacityBytes: "30000000000",
      percent: 70,
      level: "warning",
    });
    expect(report.tasks).toEqual({
      pending: 0,
      running: 1,
      waiting: 0,
      complete: 1,
      failed: 1,
    });
    expect(report.completedYears).toEqual({ senado: [2025] });
    expect(report.current).toEqual([{
      source: "camara",
      year: 2026,
      phase: "catalog",
      cursor: "page:2",
      recordsPersisted: 9,
    }]);
    expect(report.failures).toEqual([{
      source: "senado",
      year: 2024,
      phase: "movements",
      lastErrorCode: "UPSTREAM_INVALID",
    }]);

    const output = JSON.stringify(report);
    expect(output).not.toContain("DATABASE_URL");
    expect(output).not.toContain("worker-with-secret");
    expect(output).not.toContain("dadosabertos.camara");
    expect(output).not.toContain("legis.senado");
  });
});
