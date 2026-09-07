import type {
  Bill,
  Lawmaker,
  LegislativeBulkBootstrap,
  LegislativeSourceAdapter,
  LegislativeSourceName,
} from "#/domain/legislative";
import type { BillGraph } from "#/server/db/repositories";
import type { AdvisoryLockResult } from "#/server/db/advisory-lock";
import { sourceErrorCode } from "#/server/http/source-error-code";
import { hydrateProject, type HydrationRepository } from "#/server/legislative/hydrate-project";
import {
  loadBillGraph,
  persistHydratedBillGraph,
} from "#/server/legislative/persist-bill-graph";

export interface SyncRepository extends HydrationRepository {
  upsertBillGraph(graph: BillGraph): Promise<void>;
  upsertLawmakers(items: Lawmaker[]): Promise<void>;
  findMissingLawmakerExternalIds(
    source: LegislativeSourceName,
    externalIds: readonly string[],
  ): Promise<string[]>;
  listTrackedBillExternalIds(source: LegislativeSourceName): Promise<string[]>;
  listRecentlyRequestedBillExternalIds(
    source: LegislativeSourceName,
    since: Date,
  ): Promise<string[]>;
  getCheckpoint(source: LegislativeSourceName): Promise<Date | null>;
  saveCheckpoint(source: LegislativeSourceName, value: Date): Promise<void>;
  markSourceSuccess(source: LegislativeSourceName, checkedAt: Date): Promise<void>;
  markSourceFailure(
    source: LegislativeSourceName,
    checkedAt: Date,
    errorCode: string,
  ): Promise<void>;
}

export interface SyncReport {
  source: LegislativeSourceName;
  bills: number;
  authors: number;
  topics: number;
  movements: number;
  voteEvents: number;
  individualVotes: number;
  lawmakers: number;
  failed: boolean;
  startedAt: string;
  finishedAt: string;
}

function createReport(source: LegislativeSourceName, now: Date): SyncReport {
  return {
    source,
    bills: 0,
    authors: 0,
    topics: 0,
    movements: 0,
    voteEvents: 0,
    individualVotes: 0,
    lawmakers: 0,
    failed: false,
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
  };
}

function supportsBulkBootstrap(
  adapter: LegislativeSourceAdapter,
): adapter is LegislativeSourceAdapter & LegislativeBulkBootstrap {
  return "streamInitialBills" in adapter
    && typeof adapter.streamInitialBills === "function";
}

function assertSource(bill: Bill, source: LegislativeSourceName) {
  if (bill.source !== source) {
    throw new Error(`Adapter ${source} returned a bill from ${bill.source}`);
  }
}

function summaryGraph(bill: Bill): BillGraph {
  return {
    bill,
    authors: [],
    topics: [],
    movements: [],
    voteEvents: [],
    individualVotes: [],
  };
}

export async function syncLawmakers(
  adapter: LegislativeSourceAdapter,
  repository: Pick<SyncRepository, "upsertLawmakers">,
) {
  let count = 0;
  let cursor: string | undefined;
  const seenCursors = new Set<string>();

  do {
    const page = await adapter.listActiveLawmakers(cursor);
    for (const lawmaker of page.items) {
      if (lawmaker.source !== adapter.source) {
        throw new Error(`Adapter ${adapter.source} returned a lawmaker from ${lawmaker.source}`);
      }
    }
    if (page.items.length > 0) {
      await repository.upsertLawmakers(page.items);
      count += page.items.length;
    }
    cursor = page.nextCursor ?? undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) throw new Error("Lawmaker pagination cycle detected");
      seenCursors.add(cursor);
    }
  } while (cursor);

  return count;
}

export { loadBillGraph, persistHydratedBillGraph };

export async function hydrateBill(
  adapter: LegislativeSourceAdapter,
  repository: SyncRepository,
  billExternalId: string,
  _now: Date,
): Promise<void> {
  await persistHydratedBillGraph(adapter, repository, billExternalId);
}

function addGraphToReport(report: SyncReport, graph: BillGraph) {
  report.bills += 1;
  addGraphDetailsToReport(report, graph);
}

function addGraphDetailsToReport(report: SyncReport, graph: BillGraph) {
  report.authors += graph.authors.length;
  report.topics += graph.topics.length;
  report.movements += graph.movements.length;
  report.voteEvents += graph.voteEvents.length;
  report.individualVotes += graph.individualVotes.length;
}

export { sourceErrorCode };

export async function syncSource(
  adapter: LegislativeSourceAdapter,
  repository: SyncRepository,
  now: Date,
  options: {
    historyStartYear: number;
    withHydrationLock?<T>(
      name: string,
      operation: () => Promise<T>,
    ): Promise<AdvisoryLockResult<T>>;
  },
): Promise<SyncReport> {
  const report = createReport(adapter.source, now);

  try {
    report.lawmakers = await syncLawmakers(adapter, repository);
    const checkpoint = await repository.getCheckpoint(adapter.source);

    if (!checkpoint) {
      const since = new Date(Date.UTC(options.historyStartYear, 0, 1));

      if (supportsBulkBootstrap(adapter)) {
        for await (const bill of adapter.streamInitialBills(since, now)) {
          assertSource(bill, adapter.source);
          const graph = summaryGraph(bill);
          await repository.upsertBillGraph(graph);
          addGraphToReport(report, graph);
        }
      } else {
        await syncSummaryPages(adapter, repository, since, report);
      }
    } else {
      const since = new Date(
        Temporal.Instant.from(checkpoint.toISOString())
          .subtract({ minutes: 5 })
          .epochMilliseconds,
      );
      await syncHydratedPages(adapter, repository, since, now, report, options.withHydrationLock);
    }

    await repository.saveCheckpoint(adapter.source, now);
    await repository.markSourceSuccess(adapter.source, now);
  } catch (error) {
    report.failed = true;
    try {
      await repository.markSourceFailure(adapter.source, now, sourceErrorCode(error));
    } catch {
      // The report remains failed if both the source and health persistence are unavailable.
    }
  }

  report.finishedAt = now.toISOString();
  return report;
}

async function syncSummaryPages(
  adapter: LegislativeSourceAdapter,
  repository: SyncRepository,
  since: Date,
  report: SyncReport,
) {
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  do {
    const page = await adapter.listBillsChangedSince(since, cursor);
    for (const bill of page.items) {
      assertSource(bill, adapter.source);
      const graph = summaryGraph(bill);
      await repository.upsertBillGraph(graph);
      addGraphToReport(report, graph);
    }
    cursor = page.nextCursor ?? undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) throw new Error("Bill pagination cycle detected");
      seenCursors.add(cursor);
    }
  } while (cursor);
}

async function syncHydratedPages(
  adapter: LegislativeSourceAdapter,
  repository: SyncRepository,
  since: Date,
  now: Date,
  report: SyncReport,
  withHydrationLock: (<T>(
    name: string,
    operation: () => Promise<T>,
  ) => Promise<AdvisoryLockResult<T>>) | undefined,
) {
  const lock = withHydrationLock ?? (async <T>(
    _name: string,
    operation: () => Promise<T>,
  ): Promise<AdvisoryLockResult<T>> => ({ acquired: true, value: await operation() }));
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  const hydratedBillIds = new Set<string>();
  const reportedBillIds = new Set<string>();

  const hydrateOnce = async (billExternalId: string) => {
    if (hydratedBillIds.has(billExternalId)) return;
    hydratedBillIds.add(billExternalId);
    let graph: BillGraph | null = null;
    const result = await hydrateProject({
      source: adapter.source,
      externalId: billExternalId,
      adapter,
      repository,
      withLock: lock,
      persist: async () => {
        graph = await persistHydratedBillGraph(adapter, repository, billExternalId);
      },
      now,
    });
    if (graph && (result.status === "complete" || result.status === "cached")) {
      if (reportedBillIds.has(billExternalId)) {
        addGraphDetailsToReport(report, graph);
      } else {
        addGraphToReport(report, graph);
        reportedBillIds.add(billExternalId);
      }
    }
  };

  do {
    const page = await adapter.listBillsChangedSince(since, cursor);
    for (const changedBill of page.items) {
      assertSource(changedBill, adapter.source);
      const graph = summaryGraph(changedBill);
      await repository.upsertBillGraph(graph);
      addGraphToReport(report, graph);
      reportedBillIds.add(changedBill.externalId);
    }
    cursor = page.nextCursor ?? undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) throw new Error("Bill pagination cycle detected");
      seenCursors.add(cursor);
    }
  } while (cursor);

  const trackedBillIds = await repository.listTrackedBillExternalIds(adapter.source);
  const recentCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const recentlyRequestedIds = await repository.listRecentlyRequestedBillExternalIds(
    adapter.source,
    recentCutoff,
  );
  for (const billExternalId of new Set([...trackedBillIds, ...recentlyRequestedIds])) {
    await hydrateOnce(billExternalId);
  }
}
