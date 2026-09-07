import type {
  ArchivedIndividualVote,
  LegislativeVoteArchiveBootstrap,
} from "#/domain/legislative";
import { sourceErrorCode } from "#/server/http/source-error-code";

const DATASET = "individual_votes";
const BATCH_SIZE = 500;

type HistoricalCheckpoint = { status: "running" | "complete" | "failed" };

export interface CamaraVoteBackfillRepository {
  getHistoricalCheckpoint(
    source: "camara",
    dataset: typeof DATASET,
    year: number,
  ): Promise<HistoricalCheckpoint | null>;
  startHistoricalCheckpoint(
    source: "camara",
    dataset: typeof DATASET,
    year: number,
    attemptedAt: Date,
  ): Promise<void>;
  completeHistoricalCheckpoint(
    source: "camara",
    dataset: typeof DATASET,
    year: number,
    recordsRead: number,
    recordsPersisted: number,
    completedAt: Date,
  ): Promise<void>;
  failHistoricalCheckpoint(
    source: "camara",
    dataset: typeof DATASET,
    year: number,
    recordsRead: number,
    recordsPersisted: number,
    errorCode: string,
    failedAt: Date,
  ): Promise<void>;
  upsertArchivedIndividualVotes(items: readonly ArchivedIndividualVote[]): Promise<number>;
}

export interface CamaraVoteBackfillOptions {
  fromYear: number;
  throughYear: number;
  refresh?: boolean;
  now?: () => Date;
}

export interface CamaraVoteBackfillReport {
  source: "camara";
  year: number;
  read: number;
  persisted: number;
  durationMs: number;
  status: "complete" | "failed" | "skipped";
  errorCode?: string;
}

function yearInterval(year: number) {
  const nextYear = new Date(`${year + 1}-01-01T00:00:00-03:00`);
  return {
    since: new Date(`${year}-01-01T00:00:00-03:00`),
    until: new Date(nextYear.getTime() - 1),
  };
}

export async function backfillCamaraVotes(
  adapter: Pick<LegislativeVoteArchiveBootstrap, "streamHistoricalIndividualVotes">,
  repository: CamaraVoteBackfillRepository,
  options: CamaraVoteBackfillOptions,
) {
  if (options.fromYear > options.throughYear) {
    throw new RangeError("Historical start year must not be after the final year");
  }
  const now = options.now ?? (() => new Date());
  const reports: CamaraVoteBackfillReport[] = [];

  for (let year = options.fromYear; year <= options.throughYear; year += 1) {
    const checkpoint = await repository.getHistoricalCheckpoint("camara", DATASET, year);
    if (checkpoint?.status === "complete" && !options.refresh) {
      reports.push({
        source: "camara",
        year,
        read: 0,
        persisted: 0,
        durationMs: 0,
        status: "skipped",
      });
      continue;
    }

    const startedAt = now();
    await repository.startHistoricalCheckpoint("camara", DATASET, year, startedAt);
    let read = 0;
    let persisted = 0;
    let batch: ArchivedIndividualVote[] = [];
    const flush = async () => {
      if (batch.length === 0) return;
      persisted += await repository.upsertArchivedIndividualVotes(batch);
      batch = [];
    };

    try {
      const { since, until } = yearInterval(year);
      for await (const item of adapter.streamHistoricalIndividualVotes(since, until)) {
        read += 1;
        batch.push(item);
        if (batch.length === BATCH_SIZE) await flush();
      }
      await flush();
      const completedAt = now();
      await repository.completeHistoricalCheckpoint(
        "camara",
        DATASET,
        year,
        read,
        persisted,
        completedAt,
      );
      reports.push({
        source: "camara",
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
        "camara",
        DATASET,
        year,
        read,
        persisted,
        errorCode,
        failedAt,
      );
      reports.push({
        source: "camara",
        year,
        read,
        persisted,
        durationMs: failedAt.getTime() - startedAt.getTime(),
        status: "failed",
        errorCode,
      });
    }
  }

  return reports;
}
