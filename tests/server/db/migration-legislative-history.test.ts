import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("legislative history migration", () => {
  it("adds independent catalog checkpoints and per-bill hydration state", async () => {
    const migration = await readFile(
      new URL("../../../drizzle/0011_legislative_history.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain('CREATE TABLE "historical_import_checkpoints"');
    expect(migration).toContain('UNIQUE("source","dataset","year")');
    expect(migration).toContain('CREATE TABLE "bill_hydration_state"');
    expect(migration).toContain('UNIQUE("bill_id")');
    expect(migration).toContain('CREATE TYPE "public"."bill_hydration_status"');
  });
});
