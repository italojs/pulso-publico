import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AlertRepository } from "#/alerts/alert-repository";
import { FollowRepository } from "#/follows/follow-repository";
import { users } from "#/server/db/schema";
import { LegislativeRepository } from "#/server/db/repositories";
import { migrateTestDatabase, testDb, testSql, truncateLegislativeTables } from "../setup-database.ts";

beforeAll(migrateTestDatabase);
beforeEach(truncateLegislativeTables);
afterAll(() => testSql.end());

const initialGraph = {
  bill: {
    source: "camara" as const,
    externalId: "alert-7001",
    officialCode: "PL 70/2026",
    congressionalKey: "PL-70-2026",
    officialTitle: "Projeto de Lei nº 70, de 2026",
    officialSummary: "Ementa oficial.",
    originHouse: "camara" as const,
    currentHouse: "camara" as const,
    statusCode: "comissao",
    statusLabel: "Em análise na comissão",
    officialUrl: "https://example.com/bill",
    presentedAt: "2026-08-01T12:00:00.000Z",
    checkedAt: "2026-09-03T12:00:00.000Z",
  },
  authors: [], topics: [], movements: [], voteEvents: [], individualVotes: [],
};

describe("alerts during source synchronization", () => {
  it("does not alert on initial load and emits a later confirmed status change once", async () => {
    const legislative = new LegislativeRepository(testDb);
    const alerts = new AlertRepository(testDb);
    const follows = new FollowRepository(testDb);
    const [user] = await testDb.insert(users).values({ email: "sync-alert@example.com", passwordHash: "hash" }).returning();
    if (!user) throw new Error("user missing");

    await legislative.upsertBillGraph(initialGraph);
    expect(await alerts.listForUser(user.id)).toEqual([]);
    await follows.follow(user.id, { kind: "bill", source: "camara", externalId: "alert-7001", alertsEnabled: true });

    const changed = { ...initialGraph, bill: { ...initialGraph.bill, statusCode: "plenario", statusLabel: "Pronto para o Plenário", checkedAt: "2026-09-03T13:00:00.000Z" } };
    await legislative.upsertBillGraph(changed);
    await legislative.upsertBillGraph(changed);

    expect(await alerts.listForUser(user.id)).toEqual([
      expect.objectContaining({ type: "status_change", title: "Situação atualizada · PL 70/2026" }),
    ]);
  });
});
