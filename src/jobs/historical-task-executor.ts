import type {
  HistoricalPhase,
  HistoricalTask,
} from "#/domain/historical-collection";
import type {
  LegislativeSourceAdapter,
  LegislativeSourceName,
} from "#/domain/legislative";
import {
  collectCatalogPage,
  type HistoricalCatalogBatch,
} from "#/jobs/backfill-legislative";
import type { BillGraph } from "#/server/db/repositories";
import type { DatabaseTransaction } from "#/server/db/types";
import type { HistoricalBillReaderContract } from "#/server/historical/bill-reader";

interface HistoricalTaskBatchBase {
  read: number;
  persisted: number;
  persist(transaction: DatabaseTransaction): Promise<void>;
}

export interface HistoricalProgressBatch extends HistoricalTaskBatchBase {
  outcome: "progress";
  cursor: string;
}

export interface HistoricalCompleteBatch extends HistoricalTaskBatchBase {
  outcome: "complete";
}

export type HistoricalTaskBatch = HistoricalProgressBatch | HistoricalCompleteBatch;

export interface HistoricalTaskExecutor {
  execute(task: HistoricalTask, signal?: AbortSignal): Promise<HistoricalTaskBatch>;
}

export class HistoricalTaskExecutionError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean, options?: ErrorOptions) {
    super(code, options);
    this.name = "HistoricalTaskExecutionError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type HistoricalPhaseHandler = (
  task: HistoricalTask,
  signal?: AbortSignal,
) => Promise<HistoricalTaskBatch>;

export function createHistoricalTaskExecutor(
  handlers: Partial<Record<HistoricalPhase, HistoricalPhaseHandler>>,
): HistoricalTaskExecutor {
  return {
    async execute(task, signal) {
      const handler = handlers[task.phase];
      if (!handler) {
        throw new HistoricalTaskExecutionError(
          "HISTORICAL_PHASE_NOT_IMPLEMENTED",
          false,
        );
      }
      return handler(task, signal);
    },
  };
}

export interface LegislativeHistoricalTaskExecutorDependencies {
  adapters: Partial<Record<LegislativeSourceName, LegislativeSourceAdapter>>;
  billReader: HistoricalBillReaderContract;
  persistBillGraph(
    transaction: DatabaseTransaction,
    graph: BillGraph,
  ): Promise<void>;
  collectCatalog?: typeof collectCatalogPage;
}

function emptyPersistence() {
  return async () => undefined;
}

function completeBatch(): HistoricalCompleteBatch {
  return {
    outcome: "complete",
    read: 0,
    persisted: 0,
    persist: emptyPersistence(),
  };
}

function graphFor(
  bill: BillGraph["bill"],
  values: Partial<Omit<BillGraph, "bill">>,
): BillGraph {
  return {
    bill,
    authors: values.authors ?? [],
    topics: values.topics ?? [],
    movements: values.movements ?? [],
    voteEvents: values.voteEvents ?? [],
    individualVotes: values.individualVotes ?? [],
  };
}

function catalogTaskBatch(
  batch: HistoricalCatalogBatch,
  persistBillGraph: LegislativeHistoricalTaskExecutorDependencies["persistBillGraph"],
): HistoricalTaskBatch {
  const base = {
    read: batch.read,
    persisted: batch.persisted,
    persist: async (transaction: DatabaseTransaction) => {
      for (const graph of batch.graphs) {
        await persistBillGraph(transaction, graph);
      }
    },
  };
  if (batch.complete) return { ...base, outcome: "complete" };
  if (!batch.nextCursor) {
    throw new HistoricalTaskExecutionError("HISTORICAL_CURSOR_MISSING", false);
  }
  return { ...base, outcome: "progress", cursor: batch.nextCursor };
}

export function createLegislativeHistoricalTaskExecutor(
  dependencies: LegislativeHistoricalTaskExecutorDependencies,
): HistoricalTaskExecutor {
  const adapterFor = (source: LegislativeSourceName) => {
    const adapter = dependencies.adapters[source];
    if (!adapter) {
      throw new HistoricalTaskExecutionError("HISTORICAL_ADAPTER_MISSING", false);
    }
    return adapter;
  };
  const collectCatalog = dependencies.collectCatalog ?? collectCatalogPage;

  return createHistoricalTaskExecutor({
    catalog: async (task) => {
      const batch = await collectCatalog(
        adapterFor(task.source),
        task.year,
        task.cursor,
        100,
      );
      return catalogTaskBatch(batch, dependencies.persistBillGraph);
    },
    authors_topics: async (task) => {
      const [next] = await dependencies.billReader.list({
        source: task.source,
        year: task.year,
        after: task.cursor,
        limit: 1,
      });
      if (!next) return completeBatch();

      const adapter = adapterFor(task.source);
      const [authors, topics] = await Promise.all([
        adapter.listBillAuthors(next.bill.externalId),
        adapter.listBillTopics(next.bill.externalId),
      ]);
      const graph = graphFor(next.bill, { authors, topics });
      return {
        outcome: "progress",
        cursor: next.cursor,
        read: 1,
        persisted: authors.length + topics.length,
        persist: (transaction) => dependencies.persistBillGraph(transaction, graph),
      };
    },
    movements: async (task) => {
      const [next] = await dependencies.billReader.list({
        source: task.source,
        year: task.year,
        after: task.cursor,
        limit: 1,
      });
      if (!next) return completeBatch();

      const movements = await adapterFor(task.source)
        .listBillMovements(next.bill.externalId);
      const graph = graphFor(next.bill, { movements });
      return {
        outcome: "progress",
        cursor: next.cursor,
        read: 1,
        persisted: movements.length,
        persist: (transaction) => dependencies.persistBillGraph(transaction, graph),
      };
    },
  });
}
