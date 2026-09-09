import type { LegislativeSourceName } from "#/domain/legislative";

export const HISTORICAL_PHASES = [
  "catalog",
  "authors_topics",
  "movements",
  "vote_events",
  "individual_votes",
  "reconcile",
  "validate",
] as const;

export type HistoricalPhase = (typeof HISTORICAL_PHASES)[number];

export type HistoricalCollectionStatus =
  | "pending"
  | "running"
  | "waiting"
  | "complete"
  | "failed";

export interface HistoricalTask {
  id: string;
  source: LegislativeSourceName;
  year: number;
  phase: HistoricalPhase;
  cursor: string | null;
  status: HistoricalCollectionStatus;
  attempts: number;
  recordsRead: number;
  recordsPersisted: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date | null;
  lastErrorCode: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HistoricalBatchUpdate {
  cursor: string | null;
  recordsRead: number;
  recordsPersisted: number;
  complete?: boolean;
}
