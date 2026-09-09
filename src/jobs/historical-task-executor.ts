import type {
  HistoricalPhase,
  HistoricalTask,
} from "#/domain/historical-collection";
import type {
  ArchivedIndividualVote,
  Lawmaker,
  LegislativeSourceAdapter,
  LegislativeSourceName,
  LegislativeVoteArchiveBootstrap,
} from "#/domain/legislative";
import {
  collectCatalogPage,
  type HistoricalCatalogBatch,
} from "#/jobs/backfill-legislative";
import { collectCamaraVoteArchivePage } from "#/jobs/backfill-camara-votes";
import type { BillGraph } from "#/server/db/repositories";
import type { DatabaseTransaction } from "#/server/db/types";
import type {
  HistoricalBillReaderContract,
  HistoricalVoteReaderContract,
} from "#/server/historical/bill-reader";
import type { ResolvedBicameralPartner } from "#/server/legislative/reconcile-bicameral";

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
  voteReader?: HistoricalVoteReaderContract;
  persistBillGraph(
    transaction: DatabaseTransaction,
    graph: BillGraph,
  ): Promise<void>;
  persistLawmakers?(
    transaction: DatabaseTransaction,
    lawmakers: readonly Lawmaker[],
  ): Promise<void>;
  persistArchivedVotes?(
    transaction: DatabaseTransaction,
    items: readonly ArchivedIndividualVote[],
  ): Promise<number>;
  loadReferencedLawmakers?(
    adapter: LegislativeSourceAdapter,
    externalIds: readonly string[],
  ): Promise<Lawmaker[]>;
  resolveBicameralPartner?(
    bill: BillGraph["bill"],
  ): Promise<ResolvedBicameralPartner | null>;
  validateYear?(
    source: LegislativeSourceName,
    year: number,
  ): Promise<{ valid: true } | { valid: false; code: string }>;
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

function isVoteArchiveAdapter(
  adapter: LegislativeSourceAdapter,
): adapter is LegislativeSourceAdapter & LegislativeVoteArchiveBootstrap {
  return "streamHistoricalIndividualVotes" in adapter
    && typeof adapter.streamHistoricalIndividualVotes === "function";
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
    vote_events: async (task) => {
      const [next] = await dependencies.billReader.list({
        source: task.source,
        year: task.year,
        after: task.cursor,
        limit: 1,
      });
      if (!next) return completeBatch();

      const voteEvents = await adapterFor(task.source)
        .listBillVoteEvents(next.bill.externalId);
      const graph = graphFor(next.bill, { voteEvents });
      return {
        outcome: "progress",
        cursor: next.cursor,
        read: 1,
        persisted: voteEvents.length,
        persist: (transaction) => dependencies.persistBillGraph(transaction, graph),
      };
    },
    individual_votes: async (task) => {
      const adapter = adapterFor(task.source);
      if (task.source === "camara" && isVoteArchiveAdapter(adapter)) {
        if (!dependencies.persistArchivedVotes) {
          throw new HistoricalTaskExecutionError(
            "HISTORICAL_ARCHIVED_VOTE_PERSISTENCE_MISSING",
            false,
          );
        }
        const batch = await collectCamaraVoteArchivePage(
          adapter,
          task.year,
          task.cursor,
        );
        const base = {
          read: batch.read,
          persisted: batch.items.length,
          persist: async (transaction: DatabaseTransaction) => {
            await dependencies.persistArchivedVotes!(transaction, batch.items);
          },
        };
        if (batch.complete) return { ...base, outcome: "complete" };
        if (!batch.nextCursor) {
          throw new HistoricalTaskExecutionError("HISTORICAL_CURSOR_MISSING", false);
        }
        return { ...base, outcome: "progress", cursor: batch.nextCursor };
      }
      if (!dependencies.voteReader) {
        throw new HistoricalTaskExecutionError("HISTORICAL_VOTE_READER_MISSING", false);
      }
      const [next] = await dependencies.voteReader.listVoteEvents({
        source: task.source,
        year: task.year,
        after: task.cursor,
        limit: 1,
      });
      if (!next) return completeBatch();

      const individualVotes = next.voteEvent.isSecret
        ? []
        : await adapter.listIndividualVotes(next.voteEvent.externalId);
      if (individualVotes.some((vote) =>
        vote.source !== task.source
        || vote.voteEventExternalId !== next.voteEvent.externalId
      )) {
        throw new HistoricalTaskExecutionError("INDIVIDUAL_VOTE_IDENTITY_MISMATCH", false);
      }
      const lawmakers = individualVotes.length === 0
        ? []
        : await dependencies.loadReferencedLawmakers?.(
          adapter,
          individualVotes.map((vote) => vote.lawmakerExternalId),
        );
      if (individualVotes.length > 0 && !lawmakers) {
        throw new HistoricalTaskExecutionError("HISTORICAL_LAWMAKER_LOADER_MISSING", false);
      }
      const graph = graphFor(next.bill, {
        voteEvents: [next.voteEvent],
        individualVotes,
      });
      return {
        outcome: "progress",
        cursor: next.cursor,
        read: 1,
        persisted: individualVotes.length + (lawmakers?.length ?? 0),
        persist: async (transaction) => {
          if (lawmakers && lawmakers.length > 0) {
            if (!dependencies.persistLawmakers) {
              throw new HistoricalTaskExecutionError(
                "HISTORICAL_LAWMAKER_PERSISTENCE_MISSING",
                false,
              );
            }
            await dependencies.persistLawmakers(transaction, lawmakers);
          }
          await dependencies.persistBillGraph(transaction, graph);
        },
      };
    },
    reconcile: async (task) => {
      const [next] = await dependencies.billReader.list({
        source: task.source,
        year: task.year,
        after: task.cursor,
        limit: 1,
      });
      if (!next) return completeBatch();
      if (!dependencies.resolveBicameralPartner) {
        throw new HistoricalTaskExecutionError("HISTORICAL_RECONCILER_MISSING", false);
      }
      const partner = await dependencies.resolveBicameralPartner(next.bill);
      const graph = partner?.bill ? graphFor(partner.bill, {}) : null;
      return {
        outcome: "progress",
        cursor: next.cursor,
        read: 1,
        persisted: graph ? 1 : 0,
        persist: graph
          ? (transaction) => dependencies.persistBillGraph(transaction, graph)
          : emptyPersistence(),
      };
    },
    validate: async (task) => {
      if (!dependencies.validateYear) {
        throw new HistoricalTaskExecutionError("HISTORICAL_VALIDATOR_MISSING", false);
      }
      const result = await dependencies.validateYear(task.source, task.year);
      if (!result.valid) {
        throw new HistoricalTaskExecutionError(result.code, false);
      }
      return completeBatch();
    },
  });
}
