import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FollowRepository } from "#/follows/follow-repository";
import { parseLocalFollows, toggleLocalFollow } from "#/follows/local";
import { bills, lawmakers, users } from "#/server/db/schema";
import { migrateTestDatabase, testDb, testSql, truncateLegislativeTables } from "../setup-database.ts";

beforeAll(migrateTestDatabase);
beforeEach(truncateLegislativeTables);
afterAll(() => testSql.end());

describe("followed items", () => {
  it("parses only valid local records and toggles idempotently", () => {
    const item = { kind: "bill" as const, source: "camara" as const, externalId: "8001", label: "PL 1/2026", href: "/projetos/camara/8001" };
    const followed = toggleLocalFollow([], item, true);

    expect(toggleLocalFollow(followed, item, true)).toEqual(followed);
    expect(toggleLocalFollow(followed, item, false)).toEqual([]);
    expect(parseLocalFollows(JSON.stringify([...followed, { kind: "invalid" }]))).toEqual(followed);
  });

  it("follows projects and lawmakers, preserving enabled alerts on sync", async () => {
    const [user] = await testDb.insert(users).values({ email: "follow@example.com", passwordHash: "hash" }).returning();
    const [bill] = await testDb.insert(bills).values({
      source: "camara", externalId: "8001", officialCode: "PL 1/2026", officialTitle: "Projeto teste", officialSummary: "Ementa teste",
      originHouse: "camara", currentHouse: "camara", statusLabel: "Em análise", officialUrl: "https://example.com/bill", checkedAt: new Date(),
    }).returning();
    const [lawmaker] = await testDb.insert(lawmakers).values({
      source: "senado", externalId: "8101", name: "Pessoa Política", electoralName: "Pessoa Política", role: "senador", party: "ABC", region: "PE", active: true, officialUrl: "https://example.com/lawmaker", checkedAt: new Date(),
    }).returning();
    if (!user || !bill || !lawmaker) throw new Error("fixture failed");
    const repository = new FollowRepository(testDb);

    await expect(repository.follow(user.id, { kind: "bill", source: "camara", externalId: "8001", alertsEnabled: true })).resolves.toBe(true);
    await repository.sync(user.id, [
      { kind: "bill", source: "camara", externalId: "8001" },
      { kind: "lawmaker", source: "senado", externalId: "8101" },
    ]);
    const items = await repository.list(user.id);

    expect(items).toHaveLength(2);
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "bill", externalId: "8001", alertsEnabled: true }),
      expect.objectContaining({ kind: "lawmaker", externalId: "8101" }),
    ]));
    await repository.unfollow(user.id, { kind: "bill", source: "camara", externalId: "8001" });
    expect(await repository.list(user.id)).toHaveLength(1);
  });
});
