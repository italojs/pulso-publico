import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AlertRepository } from "#/alerts/alert-repository";
import { bills, followedBills, users } from "#/server/db/schema";
import { migrateTestDatabase, testDb, testSql, truncateLegislativeTables } from "../setup-database.ts";

beforeAll(migrateTestDatabase);
beforeEach(truncateLegislativeTables);
afterAll(() => testSql.end());

describe("alert repository", () => {
  it("deduplicates events and fans out only to followers with alerts enabled", async () => {
    const [enabled, quiet] = await testDb.insert(users).values([
      { email: "enabled@example.com", passwordHash: "hash" },
      { email: "quiet@example.com", passwordHash: "hash" },
    ]).returning();
    const [bill] = await testDb.insert(bills).values({
      source: "senado", externalId: "9901", officialCode: "PL 99/2026", officialTitle: "Projeto teste", officialSummary: "Ementa",
      originHouse: "senado", currentHouse: "senado", statusLabel: "Em pauta", officialUrl: "https://example.com/bill", checkedAt: new Date(),
    }).returning();
    if (!enabled || !quiet || !bill) throw new Error("fixture failed");
    await testDb.insert(followedBills).values([
      { userId: enabled.id, billId: bill.id, alertsEnabled: true },
      { userId: quiet.id, billId: bill.id, alertsEnabled: false },
    ]);
    const repository = new AlertRepository(testDb);
    const candidate = {
      type: "vote_scheduled" as const,
      dedupeKey: "9901:movement:m1:vote_scheduled",
      occurredAt: "2026-09-03T12:00:00.000Z",
      title: "Votação agendada · PL 99/2026",
      officialDescription: "Incluído na Ordem do Dia.",
      officialUrl: "https://example.com/m1",
    };

    await expect(repository.publishForBill(bill.id, [candidate])).resolves.toBe(1);
    await expect(repository.publishForBill(bill.id, [candidate])).resolves.toBe(0);
    expect(await repository.listForUser(enabled.id)).toHaveLength(1);
    expect(await repository.listForUser(quiet.id)).toHaveLength(0);

    const [alert] = await repository.listForUser(enabled.id);
    if (!alert) throw new Error("alert missing");
    await repository.markRead(enabled.id, alert.id, new Date("2026-09-03T13:00:00Z"));
    expect((await repository.listForUser(enabled.id))[0]?.readAt).toBe("2026-09-03T13:00:00.000Z");
  });
});
