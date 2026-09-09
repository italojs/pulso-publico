import { sql } from "drizzle-orm";

import type {
  HistoricalCollectionStatus,
  HistoricalTask,
} from "#/domain/historical-collection";
import type { LegislativeSourceName } from "#/domain/legislative";
import type { Database } from "#/server/db/types";
import { HistoricalTaskRepository } from "#/server/historical/task-repository";

export const DEFAULT_DATABASE_CAPACITY_BYTES = 30_000_000_000n;

export type HistoricalStorageLevel = "ok" | "warning" | "critical" | "stop";

export interface HistoricalStatusReport {
  storage: {
    usedBytes: string;
    capacityBytes: string;
    percent: number;
    level: HistoricalStorageLevel;
  };
  tasks: Record<HistoricalCollectionStatus, number>;
  completedYears: Partial<Record<LegislativeSourceName, number[]>>;
  current: Array<Pick<
    HistoricalTask,
    "source" | "year" | "phase" | "cursor" | "recordsPersisted"
  >>;
  failures: Array<Pick<
    HistoricalTask,
    "source" | "year" | "phase" | "lastErrorCode"
  >>;
}

interface HistoricalTaskStatusReader {
  listStatus(): Promise<HistoricalTask[]>;
}

function boundedPercent(usedBytes: bigint, capacityBytes: bigint) {
  if (capacityBytes <= 0n) throw new RangeError("Database capacity must be positive");
  const basisPoints = (usedBytes * 10_000n) / capacityBytes;
  return Math.max(0, Number(basisPoints) / 100);
}

export function classifyStorage(percent: number): HistoricalStorageLevel {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new RangeError("Storage percent must be a non-negative finite number");
  }
  if (percent >= 90) return "stop";
  if (percent >= 80) return "critical";
  if (percent >= 70) return "warning";
  return "ok";
}

function sanitizeCursor(cursor: string | null) {
  if (cursor === null) return null;
  const upstreamUrl = cursor.search(/https?:\/\//iu);
  if (upstreamUrl < 0) return cursor;
  const safePrefix = cursor.slice(0, upstreamUrl).replace(/[:/\s]+$/u, "");
  return safePrefix || null;
}

export async function readHistoricalStorage(
  database: Database,
  capacityBytes: bigint = DEFAULT_DATABASE_CAPACITY_BYTES,
) {
  const rows = await database.execute<{ usedBytes: string }>(sql`
    select pg_database_size(current_database())::text as "usedBytes"
  `);
  const usedBytes = BigInt(rows[0]?.usedBytes ?? "0");
  const percent = boundedPercent(usedBytes, capacityBytes);
  return {
    usedBytes: usedBytes.toString(),
    capacityBytes: capacityBytes.toString(),
    percent,
    level: classifyStorage(percent),
  };
}

export async function readHistoricalStatus(
  database: Database,
  capacityBytes: bigint = DEFAULT_DATABASE_CAPACITY_BYTES,
  taskReader: HistoricalTaskStatusReader = new HistoricalTaskRepository(database),
): Promise<HistoricalStatusReport> {
  const [storage, allTasks] = await Promise.all([
    readHistoricalStorage(database, capacityBytes),
    taskReader.listStatus(),
  ]);
  const tasks: Record<HistoricalCollectionStatus, number> = {
    pending: 0,
    running: 0,
    waiting: 0,
    complete: 0,
    failed: 0,
  };
  for (const task of allTasks) tasks[task.status] += 1;

  const completedYears: Partial<Record<LegislativeSourceName, number[]>> = {};
  for (const task of allTasks) {
    if (task.phase !== "validate" || task.status !== "complete") continue;
    const years = completedYears[task.source] ?? [];
    if (!years.includes(task.year)) years.push(task.year);
    completedYears[task.source] = years;
  }
  for (const years of Object.values(completedYears)) {
    years.sort((left, right) => right - left);
  }

  return {
    storage,
    tasks,
    completedYears,
    current: allTasks
      .filter((task) => task.status === "running" || task.status === "waiting")
      .map((task) => ({
        source: task.source,
        year: task.year,
        phase: task.phase,
        cursor: sanitizeCursor(task.cursor),
        recordsPersisted: task.recordsPersisted,
      })),
    failures: allTasks
      .filter((task) => task.status === "failed")
      .map((task) => ({
        source: task.source,
        year: task.year,
        phase: task.phase,
        lastErrorCode: task.lastErrorCode,
      })),
  };
}
