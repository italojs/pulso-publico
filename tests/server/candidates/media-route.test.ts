import { Readable } from "node:stream";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { TseMediaEntry } from "#/integrations/tse/client";
import { ElectoralMediaStore } from "#/integrations/tse/media-store";
import {
  candidateDocuments,
  candidateGovernmentPlans,
  electoralCandidates,
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
const temporaryDirectories: string[] = [];

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

function mediaEntry(
  kind: TseMediaEntry["kind"],
  candidateExternalId: string,
  originalFilename: string,
  mimeType: TseMediaEntry["mimeType"],
  contents: Uint8Array,
): TseMediaEntry {
  return {
    kind,
    region: "ES",
    candidateExternalId,
    originalFilename,
    mimeType,
    sourceArchiveUrl: "https://cdn.tse.jus.br/official.zip",
    content: Readable.from([contents]),
  };
}

function call(handler: ReturnType<typeof createCandidateMediaHandler>, segments: string[]) {
  return handler(new Request(`http://app.test/api/candidates/media/${segments.join("/")}`), {
    params: Promise.resolve({ segments }),
  });
}

beforeAll(migrateTestDatabase);

beforeEach(async () => {
  await truncateLegislativeTables();
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

afterAll(async () => {
  await testSql.end();
});

describe("candidate official media route", () => {
  it("serves only allowlisted media owned by the current published snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "candidate-media-route-"));
    temporaryDirectories.push(root);
    const store = new ElectoralMediaStore(root);
    const currentPhotoId = "260001234567";
    const stalePhotoId = "260001234568";
    const currentPhotoKey = await store.stage("current-media", mediaEntry(
      "photos", currentPhotoId, `FC_${currentPhotoId}_div.jpg`, "image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    ));
    const stalePhotoKey = await store.stage("stale-media", mediaEntry(
      "photos", stalePhotoId, `FC_${stalePhotoId}_div.jpg`, "image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    ));
    const planKey = await store.stage("current-media", mediaEntry(
      "governmentPlans", currentPhotoId, "plano-de-governo.pdf", "application/pdf", Buffer.from("%PDF-1.7\nplan"),
    ));
    const certificateKey = await store.stage("current-media", mediaEntry(
      "certificates", currentPhotoId, "certidao-publica.pdf", "application/pdf", Buffer.from("%PDF-1.7\ncertificate"),
    ));
    await store.publish("current-media");
    await store.publish("stale-media");

    await testDb.insert(electoralSyncRuns).values([
      { syncRunId: "stale-media", electionYear: 2026, status: "successful", startedAt: checkedAt, completedAt: checkedAt, extractedAt },
      { syncRunId: "current-media", electionYear: 2026, status: "successful", startedAt: checkedAt, completedAt: checkedAt, extractedAt },
    ]);
    const [stale, current] = await testDb.insert(electoralCandidates).values([
      candidate(stalePhotoId, "stale-media", { photoStorageKey: stalePhotoKey, photoMimeType: "image/jpeg", photoOriginalFilename: `FC_${stalePhotoId}_div.jpg` }),
      candidate(currentPhotoId, "current-media", { photoStorageKey: currentPhotoKey, photoMimeType: "image/jpeg", photoOriginalFilename: `FC_${currentPhotoId}_div.jpg` }),
    ]).returning();
    if (!stale || !current) throw new Error("candidate media fixture failed");
    const [plan] = await testDb.insert(candidateGovernmentPlans).values({
      candidateId: current.id,
      officialUrl: "https://cdn.tse.jus.br/plano.pdf",
      storageKey: planKey,
      originalFilename: "plano-de-governo.pdf",
      mimeType: "application/pdf",
      checkedAt,
    }).returning();
    const [certificate] = await testDb.insert(candidateDocuments).values({
      candidateId: current.id,
      label: "Certidão pública",
      officialUrl: "https://cdn.tse.jus.br/certidao.pdf",
      storageKey: certificateKey,
      originalFilename: "certidao-publica.pdf",
      mimeType: "application/pdf",
      checkedAt,
    }).returning();
    if (!plan || !certificate) throw new Error("document media fixture failed");

    const handler = createCandidateMediaHandler({
      resolveAsset: (segments) => resolveCandidateMediaAsset(testDb, segments),
      openAsset: (storageKey) => store.open(storageKey),
    });
    const photoResponse = await call(handler, ["candidate", "2026", currentPhotoId, "photo"]);
    const planResponse = await call(handler, ["government-plan", plan.id]);
    const certificateResponse = await call(handler, ["certificate", certificate.id]);

    expect(photoResponse.status).toBe(200);
    expect(photoResponse.headers.get("content-type")).toBe("image/jpeg");
    expect(photoResponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(photoResponse.headers.get("cache-control")).toMatch(/^public, max-age=\d+, stale-while-revalidate=\d+$/);
    expect(new Uint8Array(await photoResponse.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));

    expect(planResponse.status).toBe(200);
    expect(planResponse.headers.get("content-type")).toBe("application/pdf");
    expect(planResponse.headers.get("content-disposition")).toContain("plano-de-governo.pdf");
    expect(certificateResponse.status).toBe(200);
    expect(certificateResponse.headers.get("content-disposition")).toContain("certidao-publica.pdf");
    expect(await call(handler, ["candidate", "2026", stalePhotoId, "photo"]).then((response) => response.status)).toBe(404);
  });

  it("returns the same sanitized 404 for malformed, unknown, unsafe and missing media", async () => {
    const root = await mkdtemp(join(tmpdir(), "candidate-media-route-"));
    temporaryDirectories.push(root);
    const store = new ElectoralMediaStore(root);
    await testDb.insert(electoralSyncRuns).values({
      syncRunId: "current-media", electionYear: 2026, status: "successful", startedAt: checkedAt, completedAt: checkedAt, extractedAt,
    });
    const directoryStorageKey = "current-media/photos/260001234572/directory.jpg";
    await mkdir(join(root, directoryStorageKey), { recursive: true });
    const [unsafe, missing, wrongMime, directory] = await testDb.insert(electoralCandidates).values([
      candidate("260001234569", "current-media", { photoStorageKey: "../../private.txt", photoMimeType: "image/jpeg", photoOriginalFilename: "foto.jpg" }),
      candidate("260001234570", "current-media", { photoStorageKey: "current-media/photos/260001234570/missing.jpg", photoMimeType: "image/jpeg", photoOriginalFilename: "missing.jpg" }),
      candidate("260001234571", "current-media", { photoStorageKey: "current-media/photos/260001234571/foto.jpg", photoMimeType: "text/html", photoOriginalFilename: "foto.jpg" }),
      candidate("260001234572", "current-media", { photoStorageKey: directoryStorageKey, photoMimeType: "image/jpeg", photoOriginalFilename: "directory.jpg" }),
    ]).returning();
    if (!unsafe || !missing || !wrongMime || !directory) throw new Error("negative media fixture failed");
    const handler = createCandidateMediaHandler({
      resolveAsset: (segments) => resolveCandidateMediaAsset(testDb, segments),
      openAsset: (storageKey) => store.open(storageKey),
    });

    for (const segments of [
      ["..", "private"],
      ["candidate", "2026", "260001234569", "photo", "extra"],
      ["government-plan", "not-a-uuid"],
      ["certificate", "00000000-0000-4000-8000-000000000000"],
      ["candidate", "2026", "260001234569", "photo"],
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
      openAsset: () => { throw new Error("not reached"); },
    });

    const response = await call(handler, ["candidate", "2026", "260001234567", "photo"]);

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Mídia temporariamente indisponível.");
  });

  it("rejects a non-allowlisted MIME even if an injected resolver returns it", async () => {
    const handler = createCandidateMediaHandler({
      resolveAsset: async () => ({
        storageKey: "current-media/photos/260001234567/payload.html",
        mimeType: "text/html",
        originalFilename: "payload.html",
      }) as unknown as CandidateMediaAsset,
      openAsset: () => Readable.from(["<script>alert(1)</script>"]) as ReturnType<ElectoralMediaStore["open"]>,
    });

    const response = await call(handler, ["candidate", "2026", "260001234567", "photo"]);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Mídia não encontrada.");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
