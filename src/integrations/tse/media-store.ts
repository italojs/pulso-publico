import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, open, rename, rm, unlink } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";

import type { TseMediaEntry } from "#/integrations/tse/client";
import { TseContractError } from "#/integrations/tse/mapper";

const validRunId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const validCandidateId = /^\d{12}$/;

function storageError(code: string): TseContractError {
  return new TseContractError(code);
}

function validateRunId(runId: string): void {
  if (!validRunId.test(runId)) throw storageError("UNSAFE_STORAGE_PATH");
}

function validateFilename(filename: string): void {
  if (
    filename.length === 0
    || filename.length > 255
    || filename.includes("\0")
    || filename === "."
    || filename === ".."
    || basename(filename) !== filename
    || filename.includes("\\")
  ) {
    throw storageError("UNSAFE_STORAGE_PATH");
  }
}

function resolveBelow(root: string, key: string): string {
  if (key.length === 0 || isAbsolute(key) || key.includes("\0") || key.includes("\\")) {
    throw storageError("UNSAFE_STORAGE_PATH");
  }
  const resolved = resolve(root, key);
  const fromRoot = relative(root, resolved);
  if (fromRoot.length === 0 || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw storageError("UNSAFE_STORAGE_PATH");
  }
  return resolved;
}

export class ElectoralMediaStore {
  readonly #root: string;
  readonly #stagingRoot: string;

  constructor(root: string) {
    if (root.trim().length === 0) throw storageError("UNSAFE_STORAGE_PATH");
    this.#root = resolve(root);
    this.#stagingRoot = resolve(this.#root, ".staging");
  }

  async stage(runId: string, entry: TseMediaEntry): Promise<string> {
    validateRunId(runId);
    validateFilename(entry.originalFilename);
    if (!validCandidateId.test(entry.candidateExternalId)) {
      throw storageError("UNSAFE_STORAGE_PATH");
    }
    if (!(["photos", "governmentPlans", "certificates"] as const).includes(entry.kind)) {
      throw storageError("UNSAFE_STORAGE_PATH");
    }
    const hasExpectedFormat = entry.kind === "photos"
      ? entry.mimeType === "image/jpeg" && /\.jpe?g$/i.test(entry.originalFilename)
      : entry.mimeType === "application/pdf" && /\.pdf$/i.test(entry.originalFilename);
    if (!hasExpectedFormat) throw storageError("INVALID_MEDIA_FORMAT");

    const relativeKey = `${runId}/${entry.kind}/${entry.candidateExternalId}/${entry.originalFilename}`;
    const target = resolveBelow(this.#stagingRoot, relativeKey);
    await mkdir(resolve(target, ".."), { recursive: true });
    let created = false;
    try {
      const file = await open(target, "wx", 0o600);
      created = true;
      await pipeline(entry.content, file.createWriteStream());
      return relativeKey;
    } catch (error) {
      if (created) {
        await unlink(target).catch((unlinkError: NodeJS.ErrnoException) => {
          if (unlinkError.code !== "ENOENT") throw unlinkError;
        });
      }
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw storageError("DUPLICATE_MEDIA_ENTRY");
      }
      throw error;
    }
  }

  async publish(runId: string): Promise<void> {
    validateRunId(runId);
    const staging = resolveBelow(this.#stagingRoot, runId);
    const published = resolveBelow(this.#root, runId);
    await mkdir(this.#root, { recursive: true });
    await rename(staging, published);
  }

  async discard(runId: string): Promise<void> {
    validateRunId(runId);
    const staging = resolveBelow(this.#stagingRoot, runId);
    const published = resolveBelow(this.#root, runId);
    await Promise.all([
      rm(staging, { recursive: true, force: true }),
      rm(published, { recursive: true, force: true }),
    ]);
  }

  open(storageKey: string): ReadStream {
    const path = resolveBelow(this.#root, storageKey);
    const [runId, kind, candidateId, filename, ...rest] = storageKey.split("/");
    if (
      rest.length > 0
      || !runId
      || !kind
      || !candidateId
      || !filename
      || kind === ".staging"
    ) {
      throw storageError("UNSAFE_STORAGE_PATH");
    }
    validateRunId(runId);
    validateFilename(filename);
    if (!validCandidateId.test(candidateId)) throw storageError("UNSAFE_STORAGE_PATH");
    if (!(kind === "photos" || kind === "governmentPlans" || kind === "certificates")) {
      throw storageError("UNSAFE_STORAGE_PATH");
    }
    return createReadStream(path);
  }
}
