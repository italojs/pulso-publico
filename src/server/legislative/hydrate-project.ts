import type {
  LegislativeSourceAdapter,
  LegislativeSourceName,
} from "#/domain/legislative";
import {
  persistHydratedBillGraph,
  sourceErrorCode,
  type SyncRepository,
} from "#/jobs/sync-source";
import type { AdvisoryLockResult } from "#/server/db/advisory-lock";

export type HydrationState = {
  status: "pending" | "running" | "complete" | "failed";
  detailsCheckedAt: Date | null;
  nextRetryAt?: Date | null;
  updatedAt: Date;
};

export interface HydrationRepository {
  getHydrationState(
    source: LegislativeSourceName,
    externalId: string,
  ): Promise<HydrationState | null>;
  touchHydrationRequest(
    source: LegislativeSourceName,
    externalId: string,
    requestedAt: Date,
  ): Promise<void>;
  markHydrationRunning(
    source: LegislativeSourceName,
    externalId: string,
    requestedAt: Date,
  ): Promise<void>;
  markHydrationComplete(
    source: LegislativeSourceName,
    externalId: string,
    checkedAt: Date,
  ): Promise<void>;
  markHydrationFailed(
    source: LegislativeSourceName,
    externalId: string,
    failedAt: Date,
    nextRetryAt: Date,
    errorCode: string,
  ): Promise<void>;
}

export type HydrationResult =
  | { status: "complete" | "cached" | "busy" }
  | { status: "failed"; errorCode: string };

export interface HydrateProjectOptions {
  source: LegislativeSourceName;
  externalId: string;
  adapter: LegislativeSourceAdapter;
  repository: HydrationRepository;
  withLock<T>(name: string, operation: () => Promise<T>): Promise<AdvisoryLockResult<T>>;
  persist?: () => Promise<void>;
  now?: Date;
}

const FRESH_DETAILS_MS = 30 * 60_000;
const STALE_RUNNING_MS = 5 * 60_000;
const RETRY_DELAY_MS = 5 * 60_000;

function isRecent(value: Date | null | undefined, now: Date, maximumAge: number) {
  return value !== null
    && value !== undefined
    && now.getTime() - value.getTime() < maximumAge;
}

export async function hydrateProject({
  source,
  externalId,
  adapter,
  repository,
  withLock,
  persist,
  now = new Date(),
}: HydrateProjectOptions): Promise<HydrationResult> {
  if (adapter.source !== source) {
    throw new Error(`Adapter ${adapter.source} cannot hydrate a ${source} bill`);
  }

  const state = await repository.getHydrationState(source, externalId);
  await repository.touchHydrationRequest(source, externalId, now);

  if (
    state?.status === "complete"
    && isRecent(state.detailsCheckedAt, now, FRESH_DETAILS_MS)
  ) {
    return { status: "cached" };
  }
  if (
    state?.status === "running"
    && isRecent(state.updatedAt, now, STALE_RUNNING_MS)
  ) {
    return { status: "busy" };
  }
  if (
    state?.status === "failed"
    && state.nextRetryAt
    && state.nextRetryAt.getTime() > now.getTime()
  ) {
    return { status: "failed", errorCode: "RETRY_PENDING" };
  }

  const locked = await withLock(`bill-hydration:${source}:${externalId}`, async () => {
    await repository.markHydrationRunning(source, externalId, now);
    try {
      if (persist) {
        await persist();
      } else {
        await persistHydratedBillGraph(
          adapter,
          repository as HydrationRepository & SyncRepository,
          externalId,
        );
      }
      await repository.markHydrationComplete(source, externalId, now);
      return { status: "complete" as const };
    } catch (error) {
      const errorCode = sourceErrorCode(error);
      await repository.markHydrationFailed(
        source,
        externalId,
        now,
        new Date(now.getTime() + RETRY_DELAY_MS),
        errorCode,
      );
      return { status: "failed" as const, errorCode };
    }
  });

  return locked.acquired ? locked.value : { status: "busy" };
}
