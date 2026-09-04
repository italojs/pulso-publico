import { and, asc, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { alertEvents, bills, pushSubscriptions, userAlerts } from "#/server/db/schema";
import type * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;

export class PushRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async saveSubscription(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null }) {
    const values = {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      expiresAt: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
    };
    await this.database.insert(pushSubscriptions).values(values).onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { ...values, updatedAt: new Date() },
    });
  }

  async removeSubscription(userId: string, endpoint: string) {
    await this.database.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  }

  async removeEndpoint(endpoint: string) {
    await this.database.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async listPending(limit = 100) {
    const rows = await this.database
      .select({
        userAlertId: userAlerts.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
        title: alertEvents.title,
        body: alertEvents.officialDescription,
        source: bills.source,
        billExternalId: bills.externalId,
      })
      .from(userAlerts)
      .innerJoin(alertEvents, eq(userAlerts.alertEventId, alertEvents.id))
      .innerJoin(bills, eq(alertEvents.billId, bills.id))
      .innerJoin(pushSubscriptions, eq(userAlerts.userId, pushSubscriptions.userId))
      .where(isNull(userAlerts.deliveredAt))
      .orderBy(asc(userAlerts.createdAt))
      .limit(Math.min(Math.max(limit, 1), 500));
    return rows.map((row) => ({
      userAlertId: row.userAlertId,
      subscription: { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      payload: { title: row.title, body: row.body, url: `/projetos/${row.source}/${row.billExternalId}` },
    }));
  }

  async markDelivered(userAlertId: string, deliveredAt = new Date()) {
    await this.database.update(userAlerts).set({ deliveredAt }).where(eq(userAlerts.id, userAlertId));
  }
}
