import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { LegislativeSourceName } from "#/domain/legislative";
import { bills, followedBills, followedLawmakers, lawmakers } from "#/server/db/schema";
import type * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;

export type FollowReference = {
  kind: "bill" | "lawmaker";
  source: LegislativeSourceName;
  externalId: string;
  alertsEnabled?: boolean;
};

export class FollowRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async follow(userId: string, reference: FollowReference) {
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

  async sync(userId: string, references: FollowReference[]) {
    let synced = 0;
    for (const reference of references.slice(0, 200)) {
      if (await this.follow(userId, { ...reference, alertsEnabled: false })) synced += 1;
    }
    return synced;
  }

  async unfollow(userId: string, reference: FollowReference) {
    if (reference.kind === "bill") {
      const [bill] = await this.database.select({ id: bills.id }).from(bills).where(and(eq(bills.source, reference.source), eq(bills.externalId, reference.externalId))).limit(1);
      if (bill) await this.database.delete(followedBills).where(and(eq(followedBills.userId, userId), eq(followedBills.billId, bill.id)));
      return;
    }
    const [lawmaker] = await this.database.select({ id: lawmakers.id }).from(lawmakers).where(and(eq(lawmakers.source, reference.source), eq(lawmakers.externalId, reference.externalId))).limit(1);
    if (lawmaker) await this.database.delete(followedLawmakers).where(and(eq(followedLawmakers.userId, userId), eq(followedLawmakers.lawmakerId, lawmaker.id)));
  }

  async list(userId: string) {
    const [billRows, lawmakerRows] = await Promise.all([
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
    ]);
    return [
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
    ].sort((left, right) => right.followedAt.localeCompare(left.followedAt));
  }
}
