import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { billAuthors, billTopics, lawmakers, movements } from "#/server/db/schema";
import { getPublicBill, listPublicBills } from "#/server/public/queries";
import { migrateTestDatabase, testDb, testSql, truncateLegislativeTables } from "../setup-database.ts";

beforeAll(migrateTestDatabase);
beforeEach(truncateLegislativeTables);
afterAll(() => testSql.end());

describe("synthetic demonstration seed", () => {
  it("adds labeled projects to the public feed without creating user accounts", async () => {
    const { seedDemo } = await import("#/development/seed-demo");
    await seedDemo(testDb, new Date("2026-09-15T12:00:00Z"));
    const feed = await listPublicBills(testDb, {});
    expect(feed.total).toBe(3);
    expect(feed.items.every((item) => item.officialTitle.includes("DEMONSTRAÇÃO"))).toBe(true);
    const project = await getPublicBill(testDb, "camara", "demo-001");
    expect(project?.authors[0]?.name).toBe("Parlamentar Exemplo — pessoa fictícia");
    expect(project?.topics).toContain("Educação (demonstração)");
    expect(project?.timeline).toHaveLength(1);
    expect(project?.friendlyTitle).toBeNull();
    expect(await testDb.query.users.findMany()).toEqual([]);
  });

  it("can run twice without duplicating or deleting records", async () => {
    const { seedDemo } = await import("#/development/seed-demo");
    await seedDemo(testDb);
    await seedDemo(testDb);
    expect((await listPublicBills(testDb, {})).total).toBe(3);
    expect(await testDb.select().from(billAuthors)).toHaveLength(3);
    expect(await testDb.select().from(billTopics)).toHaveLength(3);
    expect(await testDb.select().from(movements)).toHaveLength(3);
    expect(await testDb.select().from(lawmakers)).toHaveLength(2);
  });
});
