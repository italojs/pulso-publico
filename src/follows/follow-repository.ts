import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { LegislativeSourceName } from "#/domain/legislative";
import {
  bills,
  electoralCandidates,
  electoralSyncRuns,
  followedBills,
  followedCandidates,
  followedLawmakers,
  lawmakers,
} from "#/server/db/schema";
import type * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;

export type LegislativeFollowReference = {
  kind: "bill" | "lawmaker";
  source: LegislativeSourceName;
  externalId: string;
  alertsEnabled?: boolean;
};

export type CandidateFollowReference = {
  kind: "candidate";
  electionYear: number;
  externalId: string;
};

export type FollowReference = LegislativeFollowReference | CandidateFollowReference;

function candidateOfficeLabel(office: string): string {
  const words = office.replaceAll("_", " ");
  return `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`;
}

function followItemKey(item: {
  kind: "bill" | "candidate" | "lawmaker";
  externalId: string;
  source?: LegislativeSourceName;
  electionYear?: number;
}): string {
  return item.kind === "candidate"
    ? `candidate:${item.electionYear}:${item.externalId}`
    : `${item.kind}:${item.source}:${item.externalId}`;
}

export class FollowRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async follow(userId: string, reference: FollowReference) {
    if (reference.kind === "candidate") {
      const latestSuccessful = this.database.select({
        syncRunId: electoralSyncRuns.syncRunId,
      }).from(electoralSyncRuns).where(and(
        eq(electoralSyncRuns.electionYear, reference.electionYear),
        eq(electoralSyncRuns.status, "successful"),
      )).orderBy(desc(electoralSyncRuns.publicationOrder)).limit(1)
        .as("latest_successful_follow_run");
      const [candidate] = await this.database.select({ id: electoralCandidates.id })
        .from(electoralCandidates)
        .innerJoin(latestSuccessful, eq(electoralCandidates.snapshotRunId, latestSuccessful.syncRunId))
        .where(and(
          eq(electoralCandidates.electionYear, reference.electionYear),
          eq(electoralCandidates.externalId, reference.externalId),
        ))
        .limit(1);
      if (!candidate) return false;
      await this.database.insert(followedCandidates).values({
        userId,
        candidateId: candidate.id,
      }).onConflictDoNothing();
      return true;
    }
    if (reference.kind === "bill") {
      const [bill] = await this.database.select({ id: bills.id }).from(bills).where(and(eq(bills.source, reference.source), eq(bills.externalId, reference.externalId))).limit(1);
      if (!bill) return false;
      const insert = this.database.insert(followedBills).values({ userId, billId: bill.id, alertsEnabled: reference.alertsEnabled ?? false });
      if (reference.alertsEnabled) {
        await insert.onConflictDoUpdate({ target: [followedBills.userId, followedBills.billId], set: { alertsEnabled: true } });
      } else {
        await insert.onConflictDoNothing();
      }
      return true;
    }
    const [lawmaker] = await this.database.select({ id: lawmakers.id }).from(lawmakers).where(and(eq(lawmakers.source, reference.source), eq(lawmakers.externalId, reference.externalId))).limit(1);
    if (!lawmaker) return false;
    await this.database.insert(followedLawmakers).values({ userId, lawmakerId: lawmaker.id }).onConflictDoNothing();
    return true;
  }

  async sync(userId: string, references: LegislativeFollowReference[]) {
    let synced = 0;
    for (const reference of references.slice(0, 200)) {
      if (await this.follow(userId, { ...reference, alertsEnabled: false })) synced += 1;
    }
    return synced;
  }

  async unfollow(userId: string, reference: FollowReference) {
    if (reference.kind === "candidate") {
      const [candidate] = await this.database.select({ id: electoralCandidates.id })
        .from(electoralCandidates)
        .where(and(
          eq(electoralCandidates.electionYear, reference.electionYear),
          eq(electoralCandidates.externalId, reference.externalId),
        ))
        .limit(1);
      if (candidate) {
        await this.database.delete(followedCandidates).where(and(
          eq(followedCandidates.userId, userId),
          eq(followedCandidates.candidateId, candidate.id),
        ));
      }
      return;
    }
    if (reference.kind === "bill") {
      const [bill] = await this.database.select({ id: bills.id }).from(bills).where(and(eq(bills.source, reference.source), eq(bills.externalId, reference.externalId))).limit(1);
      if (bill) await this.database.delete(followedBills).where(and(eq(followedBills.userId, userId), eq(followedBills.billId, bill.id)));
      return;
    }
    const [lawmaker] = await this.database.select({ id: lawmakers.id }).from(lawmakers).where(and(eq(lawmakers.source, reference.source), eq(lawmakers.externalId, reference.externalId))).limit(1);
    if (lawmaker) await this.database.delete(followedLawmakers).where(and(eq(followedLawmakers.userId, userId), eq(followedLawmakers.lawmakerId, lawmaker.id)));
  }

  async list(userId: string) {
    const [billRows, lawmakerRows, candidateRows] = await Promise.all([
      this.database
        .select({
          source: bills.source,
          externalId: bills.externalId,
          label: bills.officialCode,
          subtitle: bills.statusLabel,
          alertsEnabled: followedBills.alertsEnabled,
          followedAt: followedBills.createdAt,
        })
        .from(followedBills)
        .innerJoin(bills, eq(followedBills.billId, bills.id))
        .where(eq(followedBills.userId, userId))
        .orderBy(desc(followedBills.createdAt)),
      this.database
        .select({
          source: lawmakers.source,
          externalId: lawmakers.externalId,
          label: lawmakers.electoralName,
          party: lawmakers.party,
          region: lawmakers.region,
          followedAt: followedLawmakers.createdAt,
        })
        .from(followedLawmakers)
        .innerJoin(lawmakers, eq(followedLawmakers.lawmakerId, lawmakers.id))
        .where(eq(followedLawmakers.userId, userId))
        .orderBy(desc(followedLawmakers.createdAt)),
      this.database
        .select({
          electionYear: electoralCandidates.electionYear,
          externalId: electoralCandidates.externalId,
          label: electoralCandidates.ballotName,
          office: electoralCandidates.office,
          party: electoralCandidates.partyAcronym,
          region: electoralCandidates.region,
          followedAt: followedCandidates.createdAt,
        })
        .from(followedCandidates)
        .innerJoin(electoralCandidates, eq(followedCandidates.candidateId, electoralCandidates.id))
        .where(eq(followedCandidates.userId, userId))
        .orderBy(desc(followedCandidates.createdAt)),
    ]);
    const items = [
      ...billRows.map((item) => ({
        kind: "bill" as const,
        source: item.source,
        externalId: item.externalId,
        label: item.label,
        subtitle: item.subtitle,
        href: `/projetos/${item.source}/${item.externalId}`,
        alertsEnabled: item.alertsEnabled,
        followedAt: item.followedAt.toISOString(),
      })),
      ...lawmakerRows.map((item) => ({
        kind: "lawmaker" as const,
        source: item.source,
        externalId: item.externalId,
        label: item.label,
        subtitle: [item.party, item.region].filter(Boolean).join(" · "),
        href: `/parlamentares/${item.source}/${item.externalId}`,
        alertsEnabled: false,
        followedAt: item.followedAt.toISOString(),
      })),
      ...candidateRows.map((item) => ({
        kind: "candidate" as const,
        provider: "tse" as const,
        electionYear: item.electionYear,
        externalId: item.externalId,
        label: item.label,
        subtitle: [candidateOfficeLabel(item.office), item.party, item.region].filter(Boolean).join(" · "),
        href: `/candidatos/${item.electionYear}/${encodeURIComponent(item.externalId)}`,
        followedAt: item.followedAt.toISOString(),
      })),
    ];
    return items.sort((left, right) => {
      const chronological = right.followedAt.localeCompare(left.followedAt);
      return chronological || followItemKey(left).localeCompare(followItemKey(right));
    });
  }
}
