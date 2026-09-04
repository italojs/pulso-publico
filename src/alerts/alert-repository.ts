import { and, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { AlertCandidate } from "#/alerts/detect-events";
import { alertEvents, bills, followedBills, userAlerts } from "#/server/db/schema";
import type * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;

export class AlertRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async publishForBill(billId: string, candidates: AlertCandidate[]) {
    let published = 0;
    for (const candidate of candidates) {
      const [event] = await this.database
        .insert(alertEvents)
        .values({
          billId,
          type: candidate.type,
          dedupeKey: candidate.dedupeKey,
          occurredAt: new Date(candidate.occurredAt),
          title: candidate.title,
          officialDescription: candidate.officialDescription,
          officialUrl: candidate.officialUrl,
        })
        .onConflictDoNothing()
        .returning({ id: alertEvents.id });
      if (!event) continue;
      published += 1;
      const followers = await this.database
        .select({ userId: followedBills.userId })
        .from(followedBills)
        .where(and(eq(followedBills.billId, billId), eq(followedBills.alertsEnabled, true)));
      if (followers.length > 0) {
        await this.database
          .insert(userAlerts)
          .values(followers.map(({ userId }) => ({ userId, alertEventId: event.id })))
          .onConflictDoNothing();
      }
    }
    return published;
  }

  async listForUser(userId: string, limit = 100) {
    const rows = await this.database
      .select({
        id: userAlerts.id,
        type: alertEvents.type,
        title: alertEvents.title,
        officialDescription: alertEvents.officialDescription,
        officialUrl: alertEvents.officialUrl,
        occurredAt: alertEvents.occurredAt,
        readAt: userAlerts.readAt,
        createdAt: userAlerts.createdAt,
        source: bills.source,
        billExternalId: bills.externalId,
        officialCode: bills.officialCode,
      })
      .from(userAlerts)
      .innerJoin(alertEvents, eq(userAlerts.alertEventId, alertEvents.id))
      .innerJoin(bills, eq(alertEvents.billId, bills.id))
      .where(eq(userAlerts.userId, userId))
      .orderBy(desc(userAlerts.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200));
    return rows.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      projectHref: `/projetos/${row.source}/${row.billExternalId}`,
    }));
  }

  async markRead(userId: string, alertId: string | null, readAt = new Date()) {
    const condition = alertId
      ? and(eq(userAlerts.userId, userId), eq(userAlerts.id, alertId))
      : eq(userAlerts.userId, userId);
    await this.database.update(userAlerts).set({ readAt }).where(condition);
  }
}
