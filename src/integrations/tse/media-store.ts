import {
  closeSync,
  constants,
  createReadStream,
  createWriteStream,
  fstatSync,
  lstatSync,
  openSync,
  type ReadStream,
} from "node:fs";
import { lstat, mkdir, rename, rm, unlink } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";

import type { TseMediaEntry } from "#/integrations/tse/client";
import { TseContractError } from "#/integrations/tse/mapper";
import { isCanonicalTseCandidateExternalId } from "#/domain/tse-source";

const validRunId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function storageError(code: string): TseContractError {
  return new TseContractError(code);
}

function validateRunId(runId: string): void {
  if (!validRunId.test(runId)) throw storageError("UNSAFE_STORAGE_PATH");
}

function validateFilename(filename: string): void {
  if (
    filename.length === 0
    || Buffer.byteLength(filename, "utf8") > 255
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

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function ensureDirectoryChain(root: string, components: readonly string[]): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  let current = root;
  for (const component of components) {
    current = resolveBelow(current, component);
    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const status = await lstat(current);
    if (status.isSymbolicLink() || !status.isDirectory()) {
      throw storageError("UNSAFE_STORAGE_PATH");
    }
  }
}

async function assertNoSymlinkComponents(
  root: string,
  components: readonly string[],
): Promise<boolean> {
  let current = root;
  for (const component of components) {
    current = resolveBelow(current, component);
    try {
      const status = await lstat(current);
      if (status.isSymbolicLink()) throw storageError("UNSAFE_STORAGE_PATH");
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }
  return true;
}

function assertNoSymlinkComponentsSync(root: string, components: readonly string[]): void {
  let current = root;
  for (const component of components) {
    current = resolveBelow(current, component);
    try {
      if (lstatSync(current).isSymbolicLink()) throw storageError("UNSAFE_STORAGE_PATH");
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  }
}

export class ElectoralMediaStore {
  readonly #root: string;
  readonly #stagingRoot: string;

  constructor(root: string) {
    if (root.trim().length === 0) throw storageError("UNSAFE_STORAGE_PATH");
    this.#root = resolve(root);
    this.#stagingRoot = resolve(this.#root, ".staging");
  }

  async prepare(runId: string): Promise<void> {
    validateRunId(runId);
    await ensureDirectoryChain(this.#root, [".staging", runId]);
  }

  async stage(runId: string, entry: TseMediaEntry): Promise<string> {
    validateRunId(runId);
    validateFilename(entry.originalFilename);
    if (!isCanonicalTseCandidateExternalId(entry.candidateExternalId)) {
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
    await ensureDirectoryChain(this.#root, [
      ".staging",
      runId,
      entry.kind,
      entry.candidateExternalId,
    ]);
    try {
      const existing = await lstat(target);
      if (existing.isSymbolicLink()) throw storageError("UNSAFE_STORAGE_PATH");
      throw storageError("DUPLICATE_MEDIA_ENTRY");
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    let created = false;
    try {
      const output = createWriteStream(target, { flags: "wx", mode: 0o600 });
      output.once("open", () => { created = true; });
      await pipeline(entry.content, output);
      return relativeKey;
    } catch (error) {
      if (created) {
        await unlink(target).catch((unlinkError: NodeJS.ErrnoException) => {
          if (unlinkError.code !== "ENOENT") throw unlinkError;
        });
      }
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        const existing = await lstat(target).catch(() => undefined);
        if (existing?.isSymbolicLink()) throw storageError("UNSAFE_STORAGE_PATH");
        throw storageError("DUPLICATE_MEDIA_ENTRY");
      }
      if ((error as NodeJS.ErrnoException).code === "ELOOP") {
        throw storageError("UNSAFE_STORAGE_PATH");
      }
      throw error;
    }
  }

  async publish(runId: string): Promise<void> {
    validateRunId(runId);
    const staging = resolveBelow(this.#stagingRoot, runId);
    const published = resolveBelow(this.#root, runId);
    await ensureDirectoryChain(this.#root, [".staging"]);
    await assertNoSymlinkComponents(this.#root, [".staging", runId]);
    if (await assertNoSymlinkComponents(this.#root, [runId])) {
      throw storageError("DUPLICATE_MEDIA_GENERATION");
    }
    await rename(staging, published);
  }

  async discard(runId: string): Promise<void> {
    validateRunId(runId);
    const staging = resolveBelow(this.#stagingRoot, runId);
    const published = resolveBelow(this.#root, runId);
    const stagingExists = await assertNoSymlinkComponents(this.#root, [".staging", runId]);
    const publishedExists = await assertNoSymlinkComponents(this.#root, [runId]);
    await Promise.all([
      stagingExists ? rm(staging, { recursive: true, force: true }) : Promise.resolve(),
      publishedExists ? rm(published, { recursive: true, force: true }) : Promise.resolve(),
    ]);
  }

  async removePublished(runId: string): Promise<void> {
    validateRunId(runId);
    const published = resolveBelow(this.#root, runId);
    if (await assertNoSymlinkComponents(this.#root, [runId])) {
      await rm(published, { recursive: true, force: true });
    }
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
    if (!isCanonicalTseCandidateExternalId(candidateId)) throw storageError("UNSAFE_STORAGE_PATH");
    if (!(kind === "photos" || kind === "governmentPlans" || kind === "certificates")) {
      throw storageError("UNSAFE_STORAGE_PATH");
    }
    assertNoSymlinkComponentsSync(this.#root, [runId, kind, candidateId, filename]);
    let descriptor: number | undefined;
    try {
      descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      if (!fstatSync(descriptor).isFile()) {
        throw storageError("UNSAFE_STORAGE_PATH");
      }
      const stream = createReadStream(path, { fd: descriptor, autoClose: true });
      descriptor = undefined;
      return stream;
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          closeSync(descriptor);
        } catch {
          // The original open/fstat/stream error remains the stable public contract.
        }
      }
      if ((error as NodeJS.ErrnoException).code === "ELOOP") {
        throw storageError("UNSAFE_STORAGE_PATH");
      }
      throw error;
    }
  }
}
