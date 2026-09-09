import { describe, expect, it } from "vitest";

import type {
  HistoricalBatchUpdate,
  HistoricalTask,
} from "#/domain/historical-collection";
import {
  parseHistoricalCollectorArguments,
  runHistoricalCollector,
  type HistoricalCollectorRepository,
} from "#/jobs/historical-collector";
import type {
  HistoricalTaskBatch,
  HistoricalTaskExecutor,
} from "#/jobs/historical-task-executor";
import { OfficialSourceError } from "#/server/http/retrying-fetch";
import type { DatabaseTransaction } from "#/server/historical/task-repository";

const fixedDate = new Date("2026-09-09T12:00:00.000Z");

function task(): HistoricalTask {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    source: "camara",
    year: 2026,
    phase: "catalog",
    cursor: null,
    status: "pending",
    attempts: 0,
    recordsRead: 0,
    recordsPersisted: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
    lastErrorCode: null,
    startedAt: null,
    completedAt: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
  };
}

class MemoryRepository implements HistoricalCollectorRepository {
  readonly stored = task();
  commits = 0;
  waitCode: string | null = null;
  failureCode: string | null = null;

  async seedRange() {
    return 7;
  }

  async reserveNext(workerId: string, now: Date, leaseMs: number) {
    if (this.stored.status !== "pending") return null;
    this.stored.status = "running";
    this.stored.leaseOwner = workerId;
    this.stored.leaseExpiresAt = new Date(now.getTime() + leaseMs);
    this.stored.attempts += 1;
    return { ...this.stored };
  }

  async heartbeat() {
    return true;
  }

  async commitBatch<T>(
    _task: HistoricalTask,
    update: HistoricalBatchUpdate,
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ) {
    const result = await work({} as DatabaseTransaction);
    this.commits += 1;
    this.stored.cursor = update.cursor;
    this.stored.recordsRead += update.recordsRead;
    this.stored.recordsPersisted += update.recordsPersisted;
    this.stored.status = update.complete ? "complete" : "pending";
    this.stored.leaseOwner = null;
    return result;
  }

  async wait(_taskId: string, _workerId: string, _nextAttemptAt: Date, code: string) {
    this.waitCode = code;
    this.stored.status = "waiting";
    this.stored.leaseOwner = null;
  }

  async fail(_taskId: string, _workerId: string, code: string) {
    this.failureCode = code;
    this.stored.status = "failed";
    this.stored.leaseOwner = null;
  }

  async listStatus() {
    return [{ ...this.stored }];
  }
}

function progress(cursor: string): HistoricalTaskBatch {
  return {
    outcome: "progress",
    cursor,
    read: 1,
    persisted: 1,
    persist: async () => undefined,
  };
}

const options = {
  fromYear: 1946,
  throughYear: 2026,
  sources: ["camara"] as const,
  workerId: "worker-a",
  leaseMs: 60_000,
  once: false,
};

describe("runHistoricalCollector", () => {
  it("commits the in-flight batch before exiting after an abort", async () => {
    const repository = new MemoryRepository();
    const controller = new AbortController();
    let executions = 0;
    const executor: HistoricalTaskExecutor = {
      async execute() {
        executions += 1;
        if (executions === 2) controller.abort();
        return progress(`bill-${99 + executions}`);
      },
    };

    const report = await runHistoricalCollector(
      { repository, executor, now: () => fixedDate, sleep: async () => undefined },
      { ...options, signal: controller.signal },
    );

    expect(report).toMatchObject({ reason: "aborted", processedBatches: 2 });
    expect(repository.stored.cursor).toBe("bill-101");
    expect(repository.commits).toBe(2);
  });

  it("schedules a retry for a temporary rate limit", async () => {
    const repository = new MemoryRepository();
    const executor: HistoricalTaskExecutor = {
      async execute() {
        throw new OfficialSourceError(
          "busy",
          "https://example.test/items",
          429,
          true,
        );
      },
    };

    const report = await runHistoricalCollector(
      { repository, executor, now: () => fixedDate, sleep: async () => undefined },
      { ...options, once: true },
    );

    expect(report.reason).toBe("once");
    expect(repository.waitCode).toBe("SOURCE_RATE_LIMITED");
    expect(repository.stored.cursor).toBeNull();
  });

  it("leaves a permanent official-source failure inspectable", async () => {
    const repository = new MemoryRepository();
    const executor: HistoricalTaskExecutor = {
      async execute() {
        throw new OfficialSourceError(
          "invalid contract",
          "https://example.test/items",
          422,
          false,
        );
      },
    };

    await runHistoricalCollector(
      { repository, executor, now: () => fixedDate, sleep: async () => undefined },
      { ...options, once: true },
    );

    expect(repository.failureCode).toBe("HTTP_422");
    expect(repository.stored.status).toBe("failed");
  });
});

describe("parseHistoricalCollectorArguments", () => {
  it("parses the complete bounded command contract", () => {
    expect(parseHistoricalCollectorArguments([
      "--from=2019",
      "--through=2025",
      "--source=senado",
      "--requests-per-minute=8",
      "--once",
    ], 2026)).toEqual({
      fromYear: 2019,
      throughYear: 2025,
      sources: ["senado"],
      requestsPerMinute: 8,
      once: true,
    });
  });

  it("rejects unknown, reversed and over-limit arguments", () => {
    expect(() => parseHistoricalCollectorArguments(["--refresh"], 2026))
      .toThrow("Unknown argument");
    expect(() => parseHistoricalCollectorArguments([
      "--from=2025",
      "--through=2024",
    ], 2026)).toThrow("--from cannot be greater than --through");
    expect(() => parseHistoricalCollectorArguments([
      "--requests-per-minute=21",
    ], 2026)).toThrow("between 1 and 20");
  });
});
