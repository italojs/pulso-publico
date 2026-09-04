import type {
  Lawmaker,
  LegislativeSourceAdapter,
  LegislativeSourceName,
} from "#/domain/legislative";
import {
  persistHydratedBillGraph,
  sourceErrorCode,
  syncLawmakers,
} from "#/jobs/sync-source";
import type { BillGraph } from "#/server/db/repositories";

export interface ReconcileRepository {
  upsertBillGraph(graph: BillGraph): Promise<void>;
  upsertLawmakers(items: Lawmaker[]): Promise<void>;
  findMissingLawmakerExternalIds(
    source: LegislativeSourceName,
    externalIds: readonly string[],
  ): Promise<string[]>;
  markSourceSuccess(source: LegislativeSourceName, checkedAt: Date): Promise<void>;
  markSourceFailure(
    source: LegislativeSourceName,
    checkedAt: Date,
    errorCode: string,
  ): Promise<void>;
}

export interface ReconcileReport {
  source: LegislativeSourceName;
  from: string;
  to: string;
  days: number;
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

export interface ReconcileWindow {
  from: Date;
  to: Date;
}

function utcDay(value: Date) {
  return Temporal.Instant.from(value.toISOString())
    .toZonedDateTimeISO("UTC")
    .toPlainDate();
}

function dayBounds(day: Temporal.PlainDate) {
  const start = day.toZonedDateTime("UTC").toInstant();
  const nextStart = day.add({ days: 1 }).toZonedDateTime("UTC").toInstant();
  return {
    since: new Date(start.epochMilliseconds),
    until: new Date(nextStart.epochMilliseconds - 1),
  };
}

function addGraph(report: ReconcileReport, graph: BillGraph) {
  report.bills += 1;
  report.authors += graph.authors.length;
  report.topics += graph.topics.length;
  report.movements += graph.movements.length;
  report.voteEvents += graph.voteEvents.length;
  report.individualVotes += graph.individualVotes.length;
}

export async function reconcileSource(
  adapter: LegislativeSourceAdapter,
  repository: ReconcileRepository,
  window: ReconcileWindow,
): Promise<ReconcileReport> {
  const startedAt = new Date();
  const firstDay = utcDay(window.from);
  const finalDay = utcDay(window.to);
  const report: ReconcileReport = {
    source: adapter.source,
    from: dayBounds(firstDay).since.toISOString(),
    to: dayBounds(finalDay).until.toISOString(),
    days: 0,
    bills: 0,
    authors: 0,
    topics: 0,
    movements: 0,
    voteEvents: 0,
    individualVotes: 0,
    lawmakers: 0,
    failed: false,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
  };

  try {
    if (Temporal.PlainDate.compare(firstDay, finalDay) > 0) {
      throw new Error("Reconciliation start must not be after its end");
    }

    report.lawmakers = await syncLawmakers(adapter, repository);

    for (
      let day = firstDay;
      Temporal.PlainDate.compare(day, finalDay) <= 0;
      day = day.add({ days: 1 })
    ) {
      const bounds = dayBounds(day);
      let cursor: string | undefined;
      const seenCursors = new Set<string>();

      do {
        const page = await adapter.listBillsChangedSince(
          bounds.since,
          cursor,
          bounds.until,
        );
        for (const changedBill of page.items) {
          if (changedBill.source !== adapter.source) {
            throw new Error(
              `Adapter ${adapter.source} returned a bill from ${changedBill.source}`,
            );
          }
          const graph = await persistHydratedBillGraph(
            adapter,
            repository,
            changedBill.externalId,
          );
          addGraph(report, graph);
        }

        cursor = page.nextCursor ?? undefined;
        if (cursor) {
          if (seenCursors.has(cursor)) {
            throw new Error("Reconciliation pagination cycle detected");
          }
          seenCursors.add(cursor);
        }
      } while (cursor);

      report.days += 1;
    }

    const finishedAt = new Date();
    await repository.markSourceSuccess(adapter.source, finishedAt);
    report.finishedAt = finishedAt.toISOString();
  } catch (error) {
    report.failed = true;
    const finishedAt = new Date();
    report.finishedAt = finishedAt.toISOString();
    try {
      await repository.markSourceFailure(
        adapter.source,
        finishedAt,
        sourceErrorCode(error),
      );
    } catch {
      // Preserve the source failure even if local health persistence also fails.
    }
  }

  return report;
}
