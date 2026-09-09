import { setTimeout as delay } from "node:timers/promises";

import type {
  HistoricalBatchUpdate,
  HistoricalTask,
} from "#/domain/historical-collection";
import type { LegislativeSourceName } from "#/domain/legislative";
import {
  HistoricalTaskExecutionError,
  type HistoricalTaskExecutor,
} from "#/jobs/historical-task-executor";
import type { HistoricalStorageLevel } from "#/jobs/historical-status";
import {
  OfficialSourceError,
} from "#/server/http/retrying-fetch";
import { sourceErrorCode } from "#/server/http/source-error-code";
import type { DatabaseTransaction } from "#/server/historical/task-repository";

export interface HistoricalCollectorOptions {
  fromYear: number;
  throughYear: number;
  sources: readonly LegislativeSourceName[];
  workerId: string;
  leaseMs: number;
  once: boolean;
  signal?: AbortSignal;
}

export interface HistoricalCollectorRepository {
  seedRange(input: {
    fromYear: number;
    throughYear: number;
    sources: readonly LegislativeSourceName[];
  }): Promise<number>;
  reserveNext(workerId: string, now: Date, leaseMs: number): Promise<HistoricalTask | null>;
  heartbeat(taskId: string, workerId: string, leaseExpiresAt: Date): Promise<boolean>;
  commitBatch<T>(
    task: HistoricalTask,
    update: HistoricalBatchUpdate,
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T>;
  wait(
    taskId: string,
    workerId: string,
    nextAttemptAt: Date,
    errorCode: string,
  ): Promise<void>;
  fail(
    taskId: string,
    workerId: string,
    errorCode: string,
    failedAt: Date,
  ): Promise<void>;
  listStatus(): Promise<HistoricalTask[]>;
}

export interface HistoricalCollectorDependencies {
  repository: HistoricalCollectorRepository;
  executor: HistoricalTaskExecutor;
  readStorageLevel?: () => Promise<HistoricalStorageLevel>;
  now?: () => Date;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export type HistoricalCollectorStopReason =
  | "once"
  | "aborted"
  | "drained"
  | "blocked"
  | "capacity";

export interface HistoricalCollectorReport {
  reason: HistoricalCollectorStopReason;
  processedBatches: number;
  seededTasks: number;
}

function errorCode(error: unknown) {
  if (error instanceof OfficialSourceError && error.status === 429) {
    return "SOURCE_RATE_LIMITED";
  }
  if (error instanceof HistoricalTaskExecutionError) {
    return /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : "UNKNOWN";
  }
  return sourceErrorCode(error);
}

function isRetryable(error: unknown) {
  return error instanceof OfficialSourceError
    ? error.retryable
    : error instanceof HistoricalTaskExecutionError && error.retryable;
}

function retryAt(task: HistoricalTask, now: Date) {
  const exponent = Math.max(0, Math.min(task.attempts - 1, 5));
  return new Date(now.getTime() + Math.min(15 * 60_000, 30_000 * 2 ** exponent));
}

const defaultSleep = async (milliseconds: number, signal?: AbortSignal) => {
  await delay(milliseconds, undefined, { signal });
};

export async function runHistoricalCollector(
  dependencies: HistoricalCollectorDependencies,
  options: HistoricalCollectorOptions,
): Promise<HistoricalCollectorReport> {
  const now = dependencies.now ?? (() => new Date());
  const sleep = dependencies.sleep ?? defaultSleep;
  const seededTasks = await dependencies.repository.seedRange({
    fromYear: options.fromYear,
    throughYear: options.throughYear,
    sources: options.sources,
  });
  let processedBatches = 0;

  while (true) {
    if (options.signal?.aborted) {
      return { reason: "aborted", processedBatches, seededTasks };
    }
    if (dependencies.readStorageLevel && await dependencies.readStorageLevel() === "stop") {
      return { reason: "capacity", processedBatches, seededTasks };
    }

    const reservedAt = now();
    const task = await dependencies.repository.reserveNext(
      options.workerId,
      reservedAt,
      options.leaseMs,
    );

    if (!task) {
      const statuses = await dependencies.repository.listStatus();
      if (statuses.every((item) => item.status === "complete")) {
        return { reason: "drained", processedBatches, seededTasks };
      }
      if (statuses.every((item) => item.status === "complete" || item.status === "failed")) {
        return { reason: "blocked", processedBatches, seededTasks };
      }
      if (options.once) {
        return { reason: "once", processedBatches, seededTasks };
      }
      try {
        await sleep(5_000, options.signal);
      } catch {
        if (options.signal?.aborted) {
          return { reason: "aborted", processedBatches, seededTasks };
        }
        throw new Error("Historical collector idle wait failed");
      }
      continue;
    }

    const workerId = task.leaseOwner ?? options.workerId;
    const heartbeatSucceeded = await dependencies.repository.heartbeat(
      task.id,
      workerId,
      new Date(now().getTime() + options.leaseMs),
    );
    if (!heartbeatSucceeded) continue;

    try {
      const batch = await dependencies.executor.execute(task, options.signal);
      await dependencies.repository.commitBatch(
        task,
        {
          cursor: batch.outcome === "progress" ? batch.cursor : task.cursor,
          recordsRead: batch.read,
          recordsPersisted: batch.persisted,
          complete: batch.outcome === "complete",
        },
        batch.persist,
      );
      processedBatches += 1;
    } catch (error) {
      const failedAt = now();
      if (options.signal?.aborted) {
        await dependencies.repository.wait(
          task.id,
          workerId,
          failedAt,
          "INTERRUPTED",
        );
        return { reason: "aborted", processedBatches, seededTasks };
      }
      if (isRetryable(error)) {
        await dependencies.repository.wait(
          task.id,
          workerId,
          retryAt(task, failedAt),
          errorCode(error),
        );
      } else {
        await dependencies.repository.fail(
          task.id,
          workerId,
          errorCode(error),
          failedAt,
        );
      }
    }

    if (options.once) {
      return { reason: "once", processedBatches, seededTasks };
    }
  }
}

export interface ParsedHistoricalCollectorArguments {
  fromYear: number;
  throughYear: number;
  sources: LegislativeSourceName[];
  requestsPerMinute: number;
  once: boolean;
}

export function parseHistoricalCollectorArguments(
  args: readonly string[],
  currentYear: number,
): ParsedHistoricalCollectorArguments {
  let fromYear = 1946;
  let throughYear = currentYear;
  let sources: LegislativeSourceName[] = ["camara", "senado"];
  let requestsPerMinute = 20;
  let once = false;

  for (const argument of args) {
    if (argument.startsWith("--from=")) {
      fromYear = Number(argument.slice("--from=".length));
    } else if (argument.startsWith("--through=")) {
      throughYear = Number(argument.slice("--through=".length));
    } else if (argument.startsWith("--source=")) {
      const value = argument.slice("--source=".length);
      if (value === "all") sources = ["camara", "senado"];
      else if (value === "camara" || value === "senado") sources = [value];
      else throw new Error("--source must be camara, senado or all");
    } else if (argument.startsWith("--requests-per-minute=")) {
      requestsPerMinute = Number(argument.slice("--requests-per-minute=".length));
    } else if (argument === "--once") {
      once = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  for (const [name, value] of [["--from", fromYear], ["--through", throughYear]] as const) {
    if (!Number.isInteger(value) || value < 1946 || value > currentYear) {
      throw new Error(`${name} must be between 1946 and ${currentYear}`);
    }
  }
  if (fromYear > throughYear) {
    throw new Error("--from cannot be greater than --through");
  }
  if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 20) {
    throw new Error("--requests-per-minute must be between 1 and 20");
  }

  return { fromYear, throughYear, sources, requestsPerMinute, once };
}
