import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { isCanonicalTseCandidateExternalId } from "#/domain/tse-source";
import type { TseMediaEntry } from "#/integrations/tse/client";
import { TseContractError } from "#/integrations/tse/mapper";
import { electoralMediaBlobs } from "#/server/db/schema";
import type { Database } from "#/server/db/types";

const validRunId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const validFilename = /^[^\u0000-\u001f\u007f\\/]{1,255}$/u;
const MAX_CANDIDATE_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_IGNORED_DOCUMENT_BYTES = 64 * 1024 * 1024;

function mediaError(code: string) {
  return new TseContractError(code);
}

function validateIdentity(runId: string, entry?: TseMediaEntry) {
  if (!validRunId.test(runId)) throw mediaError("UNSAFE_STORAGE_PATH");
  if (!entry) return;
  if (
    !validFilename.test(entry.originalFilename)
    || entry.originalFilename === "."
    || entry.originalFilename === ".."
    || !isCanonicalTseCandidateExternalId(entry.candidateExternalId)
  ) {
    throw mediaError("UNSAFE_STORAGE_PATH");
  }
}

async function consumeBounded(entry: TseMediaEntry, maximumBytes: number) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of entry.content) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.byteLength;
    if (length > maximumBytes) throw mediaError("MEDIA_ENTRY_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, length);
}

function hasJpegEnvelope(content: Uint8Array) {
  return content.byteLength >= 4
    && content[0] === 0xff
    && content[1] === 0xd8
    && content.at(-2) === 0xff
    && content.at(-1) === 0xd9;
}

export class DatabaseElectoralMediaStore {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async prepare(runId: string): Promise<void> {
    validateIdentity(runId);
  }

  async stage(runId: string, entry: TseMediaEntry): Promise<string | null> {
    validateIdentity(runId, entry);
    if (entry.kind !== "photos") {
      if (entry.mimeType !== "application/pdf" || !/\.pdf$/iu.test(entry.originalFilename)) {
        throw mediaError("INVALID_MEDIA_FORMAT");
      }
      await consumeBounded(entry, MAX_IGNORED_DOCUMENT_BYTES);
      return null;
    }
    if (entry.mimeType !== "image/jpeg" || !/\.jpe?g$/iu.test(entry.originalFilename)) {
      throw mediaError("INVALID_MEDIA_FORMAT");
    }
    const content = await consumeBounded(entry, MAX_CANDIDATE_PHOTO_BYTES);
    if (!hasJpegEnvelope(content)) throw mediaError("INVALID_MEDIA_FORMAT");

    const storageKey = `${runId}/photos/${entry.candidateExternalId}/${entry.originalFilename}`;
    try {
      await this.#database.insert(electoralMediaBlobs).values({
        storageKey,
        syncRunId: runId,
        kind: "photos",
        mimeType: "image/jpeg",
        byteLength: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex"),
        content,
        published: false,
      });
    } catch (error) {
      const code = (error as { code?: unknown; cause?: { code?: unknown } }).code
        ?? (error as { cause?: { code?: unknown } }).cause?.code;
      if (code === "23505") {
        throw mediaError("DUPLICATE_MEDIA_ENTRY");
      }
      throw error;
    }
    return storageKey;
  }

  async publish(runId: string): Promise<void> {
    validateIdentity(runId);
    await this.#database.update(electoralMediaBlobs)
      .set({ published: true, updatedAt: new Date() })
      .where(eq(electoralMediaBlobs.syncRunId, runId));
  }

  async discard(runId: string): Promise<void> {
    validateIdentity(runId);
    await this.#database.delete(electoralMediaBlobs)
      .where(eq(electoralMediaBlobs.syncRunId, runId));
  }

  async removePublished(runId: string): Promise<void> {
    validateIdentity(runId);
    await this.#database.delete(electoralMediaBlobs).where(and(
      eq(electoralMediaBlobs.syncRunId, runId),
      eq(electoralMediaBlobs.published, true),
      sql`exists (
        select 1
        from electoral_sync_runs as target
        join electoral_sync_runs as newer
          on newer.election_year = target.election_year
          and newer.status = 'successful'
          and newer.publication_order > target.publication_order
        where target.sync_run_id = ${runId}
          and target.status = 'successful'
      )`,
    ));
  }
}
