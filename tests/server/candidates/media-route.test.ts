import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  electoralCandidates,
  electoralMediaBlobs,
  electoralSyncRuns,
} from "#/server/db/schema";
import type { CandidateMediaAsset } from "#/server/candidates/queries";
import {
  createCandidateMediaHandler,
  resolveCandidateMediaAsset,
} from "../../../app/api/candidates/media/[...segments]/route.ts";
import {
  migrateTestDatabase,
  testDb,
  testSql,
  truncateLegislativeTables,
} from "../../setup-database.ts";

const checkedAt = new Date("2026-09-05T12:00:00.000Z");
const extractedAt = new Date("2026-09-05T11:00:00.000Z");
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function candidate(externalId: string, snapshotRunId: string, photo: Partial<typeof electoralCandidates.$inferInsert> = {}) {
  return {
    electionYear: 2026,
    externalId,
    snapshotRunId,
    fullName: `Pessoa ${externalId}`,
    ballotName: `Candidatura ${externalId}`,
    number: Number(externalId.slice(-4)),
    office: "deputado_federal" as const,
    round: 1,
    region: "ES",
    electoralUnit: "ESPÍRITO SANTO",
    status: "APTO",
    partyAcronym: "ABC",
    partyNumber: 10,
    partyName: "Partido ABC",
    seekingReelection: false,
    officialUrl: `https://divulgacandcontas.tse.jus.br/candidato/${externalId}`,
    sourceArchiveUrl: "https://cdn.tse.jus.br/candidates.zip",
    sourceExtractedAt: extractedAt,
    checkedAt,
    ...photo,
  };
}

function blob(storageKey: string, runId: string, options: { published?: boolean; mimeType?: string } = {}) {
  return {
    storageKey,
    syncRunId: runId,
    kind: "photos",
    mimeType: options.mimeType ?? "image/jpeg",
    byteLength: jpegBytes.byteLength,
    sha256: "a".repeat(64),
    content: jpegBytes,
    published: options.published ?? true,
  };
}

function call(handler: ReturnType<typeof createCandidateMediaHandler>, segments: string[]) {
  return handler(new Request(`http://app.test/api/candidates/media/${segments.join("/")}`), {
    params: Promise.resolve({ segments }),
  });
}

beforeAll(migrateTestDatabase);
beforeEach(truncateLegislativeTables);
afterAll(async () => testSql.end());

describe("candidate official media route", () => {
  it("serves only a published JPEG owned by the current successful snapshot", async () => {
    const currentPhotoId = "260001234567";
    const stalePhotoId = "260001234568";
    const currentPhotoKey = `current-media/photos/${currentPhotoId}/foto.jpg`;
    const stalePhotoKey = `stale-media/photos/${stalePhotoId}/foto.jpg`;
    await testDb.insert(electoralSyncRuns).values([
      { syncRunId: "stale-media", electionYear: 2026, status: "successful", startedAt: checkedAt, completedAt: checkedAt, extractedAt },
      { syncRunId: "current-media", electionYear: 2026, status: "successful", startedAt: checkedAt, completedAt: checkedAt, extractedAt },
    ]);
    await testDb.insert(electoralMediaBlobs).values([
      blob(stalePhotoKey, "stale-media"),
      blob(currentPhotoKey, "current-media"),
    ]);
    await testDb.insert(electoralCandidates).values([
      candidate(stalePhotoId, "stale-media", { photoStorageKey: stalePhotoKey, photoMimeType: "image/jpeg", photoOriginalFilename: "foto.jpg" }),
      candidate(currentPhotoId, "current-media", { photoStorageKey: currentPhotoKey, photoMimeType: "image/jpeg", photoOriginalFilename: "foto.jpg" }),
    ]);

    const handler = createCandidateMediaHandler({
      resolveAsset: (segments) => resolveCandidateMediaAsset(testDb, segments),
    });
    const response = await call(handler, ["candidate", "2026", currentPhotoId, "photo"]);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toMatch(/^public, max-age=\d+, stale-while-revalidate=\d+$/);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpegBytes);
    expect(await call(handler, ["candidate", "2026", stalePhotoId, "photo"]).then((item) => item.status)).toBe(404);
    expect(await call(handler, ["government-plan", "00000000-0000-4000-8000-000000000001"]).then((item) => item.status)).toBe(404);
    expect(await call(handler, ["certificate", "00000000-0000-4000-8000-000000000002"]).then((item) => item.status)).toBe(404);
  });

  it("returns a sanitized 404 for malformed, missing, unpublished and wrong-MIME media", async () => {
    await testDb.insert(electoralSyncRuns).values({
      syncRunId: "current-media", electionYear: 2026, status: "successful", startedAt: checkedAt, completedAt: checkedAt, extractedAt,
    });
    const missingKey = "current-media/photos/260001234570/missing.jpg";
    const wrongMimeKey = "current-media/photos/260001234571/foto.jpg";
    const unpublishedKey = "current-media/photos/260001234572/foto.jpg";
    await testDb.insert(electoralMediaBlobs).values([
      blob(wrongMimeKey, "current-media", { mimeType: "text/html" }),
      blob(unpublishedKey, "current-media", { published: false }),
    ]);
    await testDb.insert(electoralCandidates).values([
      candidate("260001234570", "current-media", { photoStorageKey: missingKey, photoMimeType: "image/jpeg", photoOriginalFilename: "missing.jpg" }),
      candidate("260001234571", "current-media", { photoStorageKey: wrongMimeKey, photoMimeType: "text/html", photoOriginalFilename: "foto.jpg" }),
      candidate("260001234572", "current-media", { photoStorageKey: unpublishedKey, photoMimeType: "image/jpeg", photoOriginalFilename: "foto.jpg" }),
    ]);
    const handler = createCandidateMediaHandler({
      resolveAsset: (segments) => resolveCandidateMediaAsset(testDb, segments),
    });

    for (const segments of [
      ["..", "private"],
      ["candidate", "2026", "260001234570", "photo", "extra"],
      ["candidate", "2026", "260001234570", "photo"],
      ["candidate", "2026", "260001234571", "photo"],
      ["candidate", "2026", "260001234572", "photo"],
    ]) {
      const response = await call(handler, segments);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Mídia não encontrada.");
      expect(response.headers.get("content-type")).not.toBe("image/jpeg");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  it("sanitizes unexpected infrastructure errors", async () => {
    const handler = createCandidateMediaHandler({
      resolveAsset: async () => { throw new Error("postgres://secret@database/private"); },
    });
    const response = await call(handler, ["candidate", "2026", "260001234567", "photo"]);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Mídia temporariamente indisponível.");
  });

  it("rejects a non-allowlisted MIME even if an injected resolver returns it", async () => {
    const handler = createCandidateMediaHandler({
      resolveAsset: async () => ({
        content: new TextEncoder().encode("<script>alert(1)</script>"),
        mimeType: "text/html",
        originalFilename: "payload.html",
      }) as unknown as CandidateMediaAsset,
    });
    const response = await call(handler, ["candidate", "2026", "260001234567", "photo"]);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Mídia não encontrada.");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
