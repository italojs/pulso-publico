import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("AI practical impact migration", () => {
  it("adds practical impact and resumable batch items", async () => {
    const migration = await readFile(
      new URL("../../../drizzle/0014_high_excalibur.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain('ADD COLUMN "practical_impact" text');
    expect(migration).toContain('CREATE TYPE "public"."ai_summary_batch_status"');
    expect(migration).toContain('CREATE TABLE "ai_summary_batch_items"');
    expect(migration).toContain('UNIQUE("bill_id","prompt_version")');
  });
});
