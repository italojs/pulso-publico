import type {
  Bill,
  Lawmaker,
  LegislativeBulkBootstrap,
  LegislativeSourceAdapter,
  LegislativeSourceName,
} from "#/domain/legislative";
import type { BillGraph } from "#/server/db/repositories";
import { OfficialSourceError } from "#/server/http/retrying-fetch";

export interface SyncRepository {
  upsertBillGraph(graph: BillGraph): Promise<void>;
  upsertLawmakers(items: Lawmaker[]): Promise<void>;
  findMissingLawmakerExternalIds(
    source: LegislativeSourceName,
    externalIds: readonly string[],
  ): Promise<string[]>;
  listTrackedBillExternalIds(source: LegislativeSourceName): Promise<string[]>;
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

export async function loadBillGraph(
  adapter: LegislativeSourceAdapter,
  billExternalId: string,
): Promise<BillGraph> {
  const [bill, authors, topics, movements, voteEvents] = await Promise.all([
    adapter.getBill(billExternalId),
    adapter.listBillAuthors(billExternalId),
    adapter.listBillTopics(billExternalId),
    adapter.listBillMovements(billExternalId),
    adapter.listBillVoteEvents(billExternalId),
  ]);
  assertSource(bill, adapter.source);

  const individualVotes = (
    await Promise.all(
      voteEvents
        .filter((voteEvent) => voteEvent.isNominal && !voteEvent.isSecret)
        .map((voteEvent) => adapter.listIndividualVotes(voteEvent.externalId)),
    )
  ).flat();
  return { bill, authors, topics, movements, voteEvents, individualVotes };
}

async function hydrateBillGraph(
  adapter: LegislativeSourceAdapter,
  repository: Pick<
    SyncRepository,
    "findMissingLawmakerExternalIds" | "upsertBillGraph" | "upsertLawmakers"
  >,
  billExternalId: string,
): Promise<BillGraph> {
  const graph = await loadBillGraph(adapter, billExternalId);
  const referencedLawmakerIds = [
    ...graph.authors.flatMap((author) =>
      author.lawmakerExternalId ? [author.lawmakerExternalId] : []
    ),
    ...graph.individualVotes.map((vote) => vote.lawmakerExternalId),
  ];
  const missingLawmakerIds = await repository.findMissingLawmakerExternalIds(
    adapter.source,
    referencedLawmakerIds,
  );
  if (missingLawmakerIds.length > 0) {
    const lawmakers: Lawmaker[] = [];
    for (let index = 0; index < missingLawmakerIds.length; index += 8) {
      const batch = missingLawmakerIds.slice(index, index + 8);
      lawmakers.push(
        ...await Promise.all(
          batch.map((externalId) => adapter.getLawmaker(externalId)),
        ),
      );
    }
    for (const [index, lawmaker] of lawmakers.entries()) {
      const expectedExternalId = missingLawmakerIds[index];
      if (
        lawmaker.source !== adapter.source
        || lawmaker.externalId !== expectedExternalId
      ) {
        throw new Error(`Adapter ${adapter.source} returned an unexpected lawmaker`);
      }
    }
    await repository.upsertLawmakers(lawmakers);
  }
  await repository.upsertBillGraph(graph);
  return graph;
}

export { hydrateBillGraph as persistHydratedBillGraph };

export async function hydrateBill(
  adapter: LegislativeSourceAdapter,
  repository: SyncRepository,
  billExternalId: string,
  _now: Date,
): Promise<void> {
  await hydrateBillGraph(adapter, repository, billExternalId);
}

function addGraphToReport(report: SyncReport, graph: BillGraph) {
  report.bills += 1;
  report.authors += graph.authors.length;
  report.topics += graph.topics.length;
  report.movements += graph.movements.length;
  report.voteEvents += graph.voteEvents.length;
  report.individualVotes += graph.individualVotes.length;
}

export function sourceErrorCode(error: unknown) {
  if (error instanceof OfficialSourceError) {
    if (error.status !== null) return `HTTP_${error.status}`;
    return error.retryable ? "UPSTREAM_UNAVAILABLE" : "CONTRACT_MISMATCH";
  }
  return "UNKNOWN";
}

export async function syncSource(
  adapter: LegislativeSourceAdapter,
  repository: SyncRepository,
  now: Date,
  options: { historyStartYear: number },
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
      await syncHydratedPages(adapter, repository, since, report);
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
  report: SyncReport,
) {
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  const hydratedBillIds = new Set<string>();

  const hydrateOnce = async (billExternalId: string) => {
    if (hydratedBillIds.has(billExternalId)) return;
    const graph = await hydrateBillGraph(adapter, repository, billExternalId);
    hydratedBillIds.add(billExternalId);
    addGraphToReport(report, graph);
  };

  do {
    const page = await adapter.listBillsChangedSince(since, cursor);
    for (const changedBill of page.items) {
      assertSource(changedBill, adapter.source);
      await hydrateOnce(changedBill.externalId);
    }
    cursor = page.nextCursor ?? undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) throw new Error("Bill pagination cycle detected");
      seenCursors.add(cursor);
    }
  } while (cursor);

  const trackedBillIds = await repository.listTrackedBillExternalIds(adapter.source);
  for (const billExternalId of trackedBillIds) {
    await hydrateOnce(billExternalId);
  }
}
