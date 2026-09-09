import type {
  Bill,
  LegislativeBulkBootstrap,
  LegislativeCatalogBootstrap,
  LegislativeSourceAdapter,
  LegislativeSourceName,
} from "#/domain/legislative";
import { sourceErrorCode } from "#/server/http/source-error-code";
import type { BillGraph } from "#/server/db/repositories";

type HistoricalCheckpoint = { status: "running" | "complete" | "failed" };

export interface HistoricalBackfillRepository {
  getHistoricalCheckpoint(
    source: LegislativeSourceName,
    dataset: string,
    year: number,
  ): Promise<HistoricalCheckpoint | null>;
  startHistoricalCheckpoint(
    source: LegislativeSourceName,
    dataset: string,
    year: number,
    attemptedAt: Date,
  ): Promise<void>;
  completeHistoricalCheckpoint(
    source: LegislativeSourceName,
    dataset: string,
    year: number,
    recordsRead: number,
    recordsPersisted: number,
    completedAt: Date,
  ): Promise<void>;
  failHistoricalCheckpoint(
    source: LegislativeSourceName,
    dataset: string,
    year: number,
    recordsRead: number,
    recordsPersisted: number,
    errorCode: string,
    failedAt: Date,
  ): Promise<void>;
  upsertBillGraph(graph: BillGraph): Promise<void>;
}

export interface HistoricalBackfillOptions {
  fromYear: number;
  throughYear: number;
  sources: LegislativeSourceName[];
  refresh?: boolean;
  now?: () => Date;
}

export interface HistoricalBackfillReport {
  source: LegislativeSourceName;
  year: number;
  read: number;
  persisted: number;
  durationMs: number;
  status: "complete" | "failed" | "skipped";
  errorCode?: string;
}

export interface HistoricalCatalogBatch {
  graphs: BillGraph[];
  nextCursor: string | null;
  complete: boolean;
  read: number;
  persisted: number;
}

function isBulkAdapter(
  adapter: LegislativeSourceAdapter,
): adapter is LegislativeSourceAdapter & LegislativeBulkBootstrap {
  return "streamInitialBills" in adapter
    && typeof adapter.streamInitialBills === "function";
}

function isCatalogAdapter(
  adapter: LegislativeSourceAdapter,
): adapter is LegislativeSourceAdapter & LegislativeCatalogBootstrap {
  return "streamInitialCatalog" in adapter
    && typeof adapter.streamInitialCatalog === "function";
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

function yearInterval(year: number) {
  const nextYear = new Date(`${year + 1}-01-01T00:00:00-03:00`);
  return {
    since: new Date(`${year}-01-01T00:00:00-03:00`),
    until: new Date(nextYear.getTime() - 1),
  };
}

function archiveCursor(externalId: string) {
  return `archive:${externalId}`;
}

function parseArchiveCursor(cursor: string | null) {
  if (cursor === null) return null;
  if (!cursor.startsWith("archive:")) {
    throw new Error("Historical archive cursor is invalid");
  }
  const externalId = cursor.slice("archive:".length);
  if (!externalId) throw new Error("Historical archive cursor is empty");
  return externalId;
}

function apiCursor(cursor: string) {
  return `api:${cursor}`;
}

function parseApiCursor(cursor: string | null) {
  if (cursor === null) return undefined;
  if (!cursor.startsWith("api:")) {
    throw new Error("Historical API cursor is invalid");
  }
  const value = cursor.slice("api:".length);
  if (!value) throw new Error("Historical API cursor is empty");
  return value;
}

async function collectArchiveCatalogPage(
  stream: AsyncIterable<BillGraph>,
  cursor: string | null,
  limit: number,
): Promise<HistoricalCatalogBatch> {
  const after = parseArchiveCursor(cursor);
  let cursorFound = after === null;
  const graphs: BillGraph[] = [];

  for await (const graph of stream) {
    if (!cursorFound) {
      if (graph.bill.externalId === after) cursorFound = true;
      continue;
    }
    graphs.push(graph);
    if (graphs.length === limit) {
      const last = graphs.at(-1)!;
      return {
        graphs,
        nextCursor: archiveCursor(last.bill.externalId),
        complete: false,
        read: graphs.length,
        persisted: graphs.reduce(
          (total, item) => total + 1 + item.authors.length + item.topics.length,
          0,
        ),
      };
    }
  }

  if (!cursorFound) {
    throw new Error("Historical archive cursor was not found during resume");
  }
  return {
    graphs,
    nextCursor: null,
    complete: true,
    read: graphs.length,
    persisted: graphs.reduce(
      (total, item) => total + 1 + item.authors.length + item.topics.length,
      0,
    ),
  };
}

export async function collectCatalogPage(
  adapter: LegislativeSourceAdapter,
  year: number,
  cursor: string | null,
  limit = 100,
): Promise<HistoricalCatalogBatch> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Historical catalog batch size must be between 1 and 100");
  }
  const { since, until } = yearInterval(year);

  if (adapter.source === "camara" && isCatalogAdapter(adapter)) {
    const stream = async function* () {
      for await (const item of adapter.streamInitialCatalog(since, until)) {
        yield {
          ...item,
          movements: [],
          voteEvents: [],
          individualVotes: [],
        } satisfies BillGraph;
      }
    };
    return collectArchiveCatalogPage(stream(), cursor, limit);
  }

  if (adapter.source === "camara" && isBulkAdapter(adapter)) {
    const stream = async function* () {
      for await (const bill of adapter.streamInitialBills(since, until)) {
        yield summaryGraph(bill);
      }
    };
    return collectArchiveCatalogPage(stream(), cursor, limit);
  }

  const page = await adapter.listBillsChangedSince(since, parseApiCursor(cursor), until);
  const graphs = page.items.map(summaryGraph);
  return {
    graphs,
    nextCursor: page.nextCursor ? apiCursor(page.nextCursor) : null,
    complete: page.nextCursor === null,
    read: graphs.length,
    persisted: graphs.length,
  };
}

async function importYear(
  adapter: LegislativeSourceAdapter,
  repository: HistoricalBackfillRepository,
  year: number,
) {
  const { since, until } = yearInterval(year);
  let read = 0;
  let persisted = 0;
  const persist = async (bill: Bill) => {
    read += 1;
    await repository.upsertBillGraph(summaryGraph(bill));
    persisted += 1;
  };

  if (isCatalogAdapter(adapter)) {
    for await (const item of adapter.streamInitialCatalog(since, until)) {
      read += 1;
      await repository.upsertBillGraph({
        ...item,
        movements: [],
        voteEvents: [],
        individualVotes: [],
      });
      persisted += 1;
    }
    return { read, persisted };
  }

  if (isBulkAdapter(adapter)) {
    for await (const bill of adapter.streamInitialBills(since, until)) {
      await persist(bill);
    }
    return { read, persisted };
  }

  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  do {
    const page = await adapter.listBillsChangedSince(since, cursor, until);
    for (const bill of page.items) await persist(bill);
    cursor = page.nextCursor ?? undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) throw new Error("Historical pagination cycle detected");
      seenCursors.add(cursor);
    }
  } while (cursor);
  return { read, persisted };
}

export async function backfillLegislative(
  adapters: Partial<Record<LegislativeSourceName, LegislativeSourceAdapter>>,
  repository: HistoricalBackfillRepository,
  options: HistoricalBackfillOptions,
) {
  const now = options.now ?? (() => new Date());
  const reports: HistoricalBackfillReport[] = [];
  if (options.fromYear > options.throughYear) {
    throw new RangeError("Historical start year must not be after the final year");
  }

  for (const source of options.sources) {
    const adapter = adapters[source];
    if (!adapter) throw new Error(`Missing ${source} historical adapter`);

    for (let year = options.fromYear; year <= options.throughYear; year += 1) {
      const checkpoint = await repository.getHistoricalCheckpoint(source, "catalog", year);
      if (checkpoint?.status === "complete" && !options.refresh) {
        reports.push({ source, year, read: 0, persisted: 0, durationMs: 0, status: "skipped" });
        continue;
      }

      const startedAt = now();
      await repository.startHistoricalCheckpoint(source, "catalog", year, startedAt);
      let read = 0;
      let persisted = 0;
      try {
        const imported = await importYear(adapter, repository, year);
        read = imported.read;
        persisted = imported.persisted;
        const completedAt = now();
        await repository.completeHistoricalCheckpoint(
          source,
          "catalog",
          year,
          read,
          persisted,
          completedAt,
        );
        reports.push({
          source,
          year,
          read,
          persisted,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          status: "complete",
        });
      } catch (error) {
        const failedAt = now();
        const errorCode = sourceErrorCode(error);
        await repository.failHistoricalCheckpoint(
          source,
          "catalog",
          year,
          read,
          persisted,
          errorCode,
          failedAt,
        );
        reports.push({
          source,
          year,
          read,
          persisted,
          durationMs: failedAt.getTime() - startedAt.getTime(),
          status: "failed",
          errorCode,
        });
      }
    }
  }
  return reports;
}
