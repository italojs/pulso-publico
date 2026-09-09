import { Readable } from "node:stream";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { TseMediaEntry } from "#/integrations/tse/client";
import { DatabaseElectoralMediaStore } from "#/server/electoral/database-media-store";
import { electoralMediaBlobs, electoralSyncRuns } from "#/server/db/schema";
import {
  migrateTestDatabase,
  testDb,
  testSql,
  truncateLegislativeTables,
} from "../../setup-database.ts";

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);

function mediaEntry(
  kind: TseMediaEntry["kind"] = "photos",
  content: Uint8Array = jpegBytes,
): TseMediaEntry {
  return {
    kind,
    region: "ES",
    candidateExternalId: "260001234567",
    originalFilename: kind === "photos" ? "foto.jpg" : "documento.pdf",
    mimeType: kind === "photos" ? "image/jpeg" : "application/pdf",
    sourceArchiveUrl: "https://cdn.tse.jus.br/arquivo.zip",
    content: Readable.from([content]),
  };
}

beforeAll(migrateTestDatabase);
beforeEach(truncateLegislativeTables);
afterAll(async () => testSql.end());

describe("DatabaseElectoralMediaStore", () => {
  it("stages an unpublished JPEG and exposes it only after publication", async () => {
    const store = new DatabaseElectoralMediaStore(testDb);
    await store.prepare("run-current");

    const key = await store.stage("run-current", mediaEntry());
    expect(key).toBe("run-current/photos/260001234567/foto.jpg");
    expect(await testDb.select().from(electoralMediaBlobs)).toEqual([
      expect.objectContaining({
        storageKey: key,
        syncRunId: "run-current",
        kind: "photos",
        mimeType: "image/jpeg",
        byteLength: jpegBytes.byteLength,
        published: false,
      }),
    ]);

    await store.publish("run-current");
    expect(await testDb.select({ published: electoralMediaBlobs.published })
      .from(electoralMediaBlobs)).toEqual([{ published: true }]);
  });

  it("discards a generation and rejects duplicate or invalid JPEG entries", async () => {
    const store = new DatabaseElectoralMediaStore(testDb);
    await store.prepare("run-discard");
    await store.stage("run-discard", mediaEntry());

    await expect(store.stage("run-discard", mediaEntry()))
      .rejects.toMatchObject({ code: "DUPLICATE_MEDIA_ENTRY" });
    await expect(store.stage("run-invalid", mediaEntry("photos", new Uint8Array([1, 2, 3]))))
      .rejects.toMatchObject({ code: "INVALID_MEDIA_FORMAT" });

    await store.discard("run-discard");
    expect(await testDb.select().from(electoralMediaBlobs)).toEqual([]);
  });

  it("consumes PDFs without storing them", async () => {
    const store = new DatabaseElectoralMediaStore(testDb);
    const entry = mediaEntry("governmentPlans", Buffer.from("%PDF-1.7\nplan"));

    await expect(store.stage("run-documents", entry)).resolves.toBeNull();
    expect(await testDb.select().from(electoralMediaBlobs)).toEqual([]);
  });

  it("removes an older generation without removing the current one", async () => {
    const store = new DatabaseElectoralMediaStore(testDb);
    const staleKey = await store.stage("run-stale", mediaEntry());
    await store.publish("run-stale");
    await testDb.insert(electoralSyncRuns).values({
      syncRunId: "run-stale",
      electionYear: 2026,
      status: "successful",
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      completedAt: new Date("2026-01-01T00:01:00.000Z"),
    });
    const key = await store.stage("run-current", mediaEntry());
    await store.publish("run-current");
    await testDb.insert(electoralSyncRuns).values({
      syncRunId: "run-current",
      electionYear: 2026,
      status: "successful",
      startedAt: new Date("2026-02-01T00:00:00.000Z"),
      completedAt: new Date("2026-02-01T00:01:00.000Z"),
    });

    await store.removePublished("run-current");
    expect(await testDb.select({ storageKey: electoralMediaBlobs.storageKey })
      .from(electoralMediaBlobs)
      .where(eq(electoralMediaBlobs.storageKey, key!))).toEqual([{ storageKey: key }]);

    await store.removePublished("run-stale");
    expect(await testDb.select({ storageKey: electoralMediaBlobs.storageKey })
      .from(electoralMediaBlobs)).toEqual([{ storageKey: key }]);
    expect(staleKey).not.toBe(key);
  });
});
