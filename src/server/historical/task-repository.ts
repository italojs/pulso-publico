import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import {
  HISTORICAL_PHASES,
  type HistoricalBatchUpdate,
  type HistoricalTask,
} from "#/domain/historical-collection";
import type { LegislativeSourceName } from "#/domain/legislative";
import { historicalCollectionTasks } from "#/server/db/schema";
import * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface ReservedTaskRow extends Record<string, unknown> {
  id: string;
  source: LegislativeSourceName;
  year: number;
  phase: HistoricalTask["phase"];
  cursor: string | null;
  status: HistoricalTask["status"];
  attempts: number;
  recordsRead: number;
  recordsPersisted: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | string | null;
  nextAttemptAt: Date | string | null;
  lastErrorCode: string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function asDate(value: Date | string): Date;
function asDate(value: Date | string | null): Date | null;
function asDate(value: Date | string | null) {
  if (value === null || value instanceof Date) return value;
  return new Date(value);
}

function toTask(row: ReservedTaskRow): HistoricalTask {
  return {
    ...row,
    leaseExpiresAt: asDate(row.leaseExpiresAt),
    nextAttemptAt: asDate(row.nextAttemptAt),
    startedAt: asDate(row.startedAt),
    completedAt: asDate(row.completedAt),
    createdAt: asDate(row.createdAt),
    updatedAt: asDate(row.updatedAt),
  };
}

function boundedErrorCode(value: string) {
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : "UNKNOWN";
}

function assertSeedRange(input: { fromYear: number; throughYear: number }) {
  if (
    !Number.isInteger(input.fromYear)
    || !Number.isInteger(input.throughYear)
    || input.fromYear < 1946
    || input.throughYear < input.fromYear
  ) {
    throw new RangeError("Historical collection years must be integers from 1946 onward");
  }
}

export class HistoricalTaskRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async seedRange(input: {
    fromYear: number;
    throughYear: number;
    sources: readonly LegislativeSourceName[];
  }): Promise<number> {
    assertSeedRange(input);
    const sources = [...new Set(input.sources)];
    if (sources.length === 0) return 0;

    const values = sources.flatMap((source) => {
      const tasks = [];
      for (let year = input.fromYear; year <= input.throughYear; year += 1) {
        for (const phase of HISTORICAL_PHASES) {
          tasks.push({ source, year, phase });
        }
      }
      return tasks;
    });

    const inserted = await this.database
      .insert(historicalCollectionTasks)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: historicalCollectionTasks.id });
    return inserted.length;
  }

  async reserveNext(
    workerId: string,
    now: Date,
    leaseMs: number,
  ): Promise<HistoricalTask | null> {
    if (!workerId.trim()) throw new RangeError("workerId is required");
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
      throw new RangeError("leaseMs must be positive");
    }
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const nowIso = now.toISOString();
    const leaseExpiresAtIso = leaseExpiresAt.toISOString();
    const rows = await this.database.execute<ReservedTaskRow>(sql`
      with candidate as (
        select task.id
        from historical_collection_tasks as task
        where (
          task.status = 'pending'
          or (
            task.status = 'waiting'
            and (task.next_attempt_at is null or task.next_attempt_at <= ${nowIso})
          )
          or (
            task.status = 'running'
            and (task.lease_expires_at is null or task.lease_expires_at <= ${nowIso})
          )
        )
        and not exists (
          select 1
          from historical_collection_tasks as active
          where active.source = task.source
            and active.id <> task.id
            and active.status = 'running'
            and active.lease_expires_at > ${nowIso}
        )
        and (
          task.phase = 'catalog'
          or exists (
            select 1
            from historical_collection_tasks as predecessor
            where predecessor.source = task.source
              and predecessor.year = task.year
              and predecessor.phase = case task.phase
                when 'authors_topics' then 'catalog'::historical_collection_phase
                when 'movements' then 'authors_topics'::historical_collection_phase
                when 'vote_events' then 'movements'::historical_collection_phase
                when 'individual_votes' then 'vote_events'::historical_collection_phase
                when 'reconcile' then 'individual_votes'::historical_collection_phase
                when 'validate' then 'reconcile'::historical_collection_phase
              end
              and predecessor.status = 'complete'
          )
        )
        order by
          task.year desc,
          case task.phase
            when 'catalog' then 0
            when 'authors_topics' then 1
            when 'movements' then 2
            when 'vote_events' then 3
            when 'individual_votes' then 4
            when 'reconcile' then 5
            when 'validate' then 6
          end,
          task.updated_at,
          task.id
        for update of task skip locked
        limit 1
      )
      update historical_collection_tasks as task
      set
        status = 'running',
        attempts = task.attempts + 1,
        lease_owner = ${workerId},
        lease_expires_at = ${leaseExpiresAtIso},
        next_attempt_at = null,
        last_error_code = null,
        started_at = coalesce(task.started_at, ${nowIso}),
        updated_at = ${nowIso}
      from candidate
      where task.id = candidate.id
      returning
        task.id,
        task.source,
        task.year,
        task.phase,
        task.cursor,
        task.status,
        task.attempts,
        task.records_read as "recordsRead",
        task.records_persisted as "recordsPersisted",
        task.lease_owner as "leaseOwner",
        task.lease_expires_at as "leaseExpiresAt",
        task.next_attempt_at as "nextAttemptAt",
        task.last_error_code as "lastErrorCode",
        task.started_at as "startedAt",
        task.completed_at as "completedAt",
        task.created_at as "createdAt",
        task.updated_at as "updatedAt"
    `);
    const [row] = rows;
    return row ? toTask(row) : null;
  }

  async heartbeat(
    taskId: string,
    workerId: string,
    leaseExpiresAt: Date,
  ): Promise<boolean> {
    const updated = await this.database
      .update(historicalCollectionTasks)
      .set({ leaseExpiresAt, updatedAt: new Date() })
      .where(and(
        eq(historicalCollectionTasks.id, taskId),
        eq(historicalCollectionTasks.leaseOwner, workerId),
        eq(historicalCollectionTasks.status, "running"),
      ))
      .returning({ id: historicalCollectionTasks.id });
    return updated.length === 1;
  }

  async commitBatch<T>(
    task: HistoricalTask,
    update: HistoricalBatchUpdate,
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    if (!task.leaseOwner) {
      throw new Error("Historical task has no lease owner");
    }
    if (
      !Number.isInteger(update.recordsRead)
      || update.recordsRead < 0
      || !Number.isInteger(update.recordsPersisted)
      || update.recordsPersisted < 0
    ) {
      throw new RangeError("Historical batch counters must be non-negative integers");
    }

    return this.database.transaction(async (transaction) => {
      const rows = await transaction.execute<{ leaseOwner: string | null; status: string }>(sql`
        select lease_owner as "leaseOwner", status
        from historical_collection_tasks
        where id = ${task.id}
        for update
      `);
      const [locked] = rows;
      if (locked?.leaseOwner !== task.leaseOwner || locked.status !== "running") {
        throw new Error("Historical task lease is no longer owned by this worker");
      }

      const result = await work(transaction);
      const committedAt = new Date();
      await transaction
        .update(historicalCollectionTasks)
        .set({
          cursor: update.cursor,
          status: update.complete ? "complete" : "pending",
          recordsRead: sql`${historicalCollectionTasks.recordsRead} + ${update.recordsRead}`,
          recordsPersisted: sql`${historicalCollectionTasks.recordsPersisted} + ${update.recordsPersisted}`,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          lastErrorCode: null,
          completedAt: update.complete ? committedAt : null,
          updatedAt: committedAt,
        })
        .where(eq(historicalCollectionTasks.id, task.id));
      return result;
    });
  }

  async complete(taskId: string, workerId: string, completedAt: Date): Promise<void> {
    await this.updateOwnedTask(taskId, workerId, {
      status: "complete",
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
      lastErrorCode: null,
      completedAt,
      updatedAt: completedAt,
    });
  }

  async wait(
    taskId: string,
    workerId: string,
    nextAttemptAt: Date,
    errorCode: string,
  ): Promise<void> {
    await this.updateOwnedTask(taskId, workerId, {
      status: "waiting",
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt,
      lastErrorCode: boundedErrorCode(errorCode),
      updatedAt: new Date(),
    });
  }

  async fail(
    taskId: string,
    workerId: string,
    errorCode: string,
    failedAt: Date,
  ): Promise<void> {
    await this.updateOwnedTask(taskId, workerId, {
      status: "failed",
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
      lastErrorCode: boundedErrorCode(errorCode),
      completedAt: failedAt,
      updatedAt: failedAt,
    });
  }

  async get(taskId: string): Promise<HistoricalTask | null> {
    const [row] = await this.database
      .select()
      .from(historicalCollectionTasks)
      .where(eq(historicalCollectionTasks.id, taskId))
      .limit(1);
    return row ?? null;
  }

  async listStatus(): Promise<HistoricalTask[]> {
    return this.database
      .select()
      .from(historicalCollectionTasks)
      .orderBy(
        desc(historicalCollectionTasks.year),
        sql`case ${historicalCollectionTasks.phase}
          when 'catalog' then 0
          when 'authors_topics' then 1
          when 'movements' then 2
          when 'vote_events' then 3
          when 'individual_votes' then 4
          when 'reconcile' then 5
          when 'validate' then 6
        end`,
        historicalCollectionTasks.source,
      );
  }

  private async updateOwnedTask(
    taskId: string,
    workerId: string,
    values: Partial<typeof historicalCollectionTasks.$inferInsert>,
  ) {
    const updated = await this.database
      .update(historicalCollectionTasks)
      .set(values)
      .where(and(
        eq(historicalCollectionTasks.id, taskId),
        eq(historicalCollectionTasks.leaseOwner, workerId),
        eq(historicalCollectionTasks.status, "running"),
      ))
      .returning({ id: historicalCollectionTasks.id });
    if (updated.length !== 1) {
      throw new Error("Historical task lease is no longer owned by this worker");
    }
  }
}
