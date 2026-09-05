import { Readable } from "node:stream";
import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { TseMediaEntry } from "#/integrations/tse/client";
import { ElectoralMediaStore } from "#/integrations/tse/media-store";

const temporaryDirectories: string[] = [];

async function createStore(): Promise<{ root: string; store: ElectoralMediaStore }> {
  const root = await mkdtemp(join(tmpdir(), "electoral-media-store-"));
  temporaryDirectories.push(root);
  return { root, store: new ElectoralMediaStore(root) };
}

function mediaEntry(
  contents: string | Readable = "jpeg-data",
  originalFilename = "FC_260001234567_div.jpg",
): TseMediaEntry {
  return {
    kind: "photos",
    region: "ES",
    candidateExternalId: "260001234567",
    originalFilename,
    mimeType: "image/jpeg",
    sourceArchiveUrl: "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_ES_div.zip",
    content: typeof contents === "string" ? Readable.from([contents]) : contents,
  };
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("ElectoralMediaStore", () => {
  it("stages streamed media and exposes it only after atomic publication", async () => {
    const { root, store } = await createStore();
    const storageKey = await store.stage("sync-2026-09-05", mediaEntry());

    await expect(readFile(join(root, storageKey))).rejects.toMatchObject({ code: "ENOENT" });
    await store.publish("sync-2026-09-05");

    await expect(readFile(join(root, storageKey), "utf8")).resolves.toBe("jpeg-data");
    const chunks: Buffer[] = [];
    for await (const chunk of store.open(storageKey)) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("jpeg-data");
  });

  it("publishes a prepared empty generation and removes only a named published generation", async () => {
    const { root, store } = await createStore();
    const keepKey = await store.stage("keep-run", mediaEntry("keep"));
    await store.publish("keep-run");
    await store.prepare("empty-run");
    await store.publish("empty-run");

    await store.removePublished("empty-run");

    await expect(readFile(join(root, keepKey), "utf8")).resolves.toBe("keep");
    await expect(readFile(join(root, "empty-run"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects traversal in run IDs, filenames and lookup keys", async () => {
    const { store } = await createStore();

    await expect(store.stage("../outside", mediaEntry())).rejects.toMatchObject({
      code: "UNSAFE_STORAGE_PATH",
    });
    await expect(store.stage("safe-run", mediaEntry("data", "../outside.jpg"))).rejects.toMatchObject({
      code: "UNSAFE_STORAGE_PATH",
    });
    expect(() => store.open("../outside.jpg")).toThrowError(expect.objectContaining({
      code: "UNSAFE_STORAGE_PATH",
    }));
  });

  it("rejects symlinks below staging before writing or publishing", async () => {
    const { root, store } = await createStore();
    const outside = await mkdtemp(join(tmpdir(), "electoral-media-outside-"));
    temporaryDirectories.push(outside);
    await mkdir(join(root, ".staging"), { recursive: true });
    await symlink(outside, join(root, ".staging", "safe-run"), "dir");

    await expect(store.stage("safe-run", mediaEntry("escaped"))).rejects.toMatchObject({
      code: "UNSAFE_STORAGE_PATH",
    });
    await expect(readFile(join(outside, "photos", "260001234567", "FC_260001234567_div.jpg")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(store.publish("safe-run")).rejects.toMatchObject({
      code: "UNSAFE_STORAGE_PATH",
    });
  });

  it("rejects published symlinks instead of exposing files outside the root", async () => {
    const { root, store } = await createStore();
    const outside = await mkdtemp(join(tmpdir(), "electoral-media-outside-"));
    temporaryDirectories.push(outside);
    await mkdir(join(outside, "photos", "260001234567"), { recursive: true });
    await writeFile(join(outside, "photos", "260001234567", "FC_260001234567_div.jpg"), "secret");
    await symlink(outside, join(root, "unsafe-run"), "dir");

    expect(() => store.open("unsafe-run/photos/260001234567/FC_260001234567_div.jpg"))
      .toThrowError(expect.objectContaining({ code: "UNSAFE_STORAGE_PATH" }));
  });

  it("rejects a non-regular inode at a valid key without leaking descriptors", async () => {
    const { root, store } = await createStore();
    const storageKey = "safe-run/photos/260001234567/directory.jpg";
    await mkdir(join(root, storageKey), { recursive: true });
    const descriptorsBefore = (await readdir("/dev/fd")).length;

    for (let attempt = 0; attempt < 32; attempt += 1) {
      expect(() => store.open(storageKey)).toThrowError(expect.objectContaining({
        code: "UNSAFE_STORAGE_PATH",
      }));
    }

    const descriptorsAfter = (await readdir("/dev/fd")).length;
    expect(descriptorsAfter).toBeLessThanOrEqual(descriptorsBefore + 1);
  });

  it("rejects media whose extension and MIME do not match its kind", async () => {
    const { store } = await createStore();
    const invalid = {
      ...mediaEntry("not-a-pdf", "260001234567.pdf"),
      mimeType: "application/pdf" as const,
    };

    await expect(store.stage("safe-run", invalid)).rejects.toMatchObject({
      code: "INVALID_MEDIA_FORMAT",
    });
  });

  it("uses exclusive creation to reject duplicate staged names", async () => {
    const { root, store } = await createStore();
    const storageKey = await store.stage("safe-run", mediaEntry("first"));

    await expect(store.stage("safe-run", mediaEntry("second"))).rejects.toMatchObject({
      code: "DUPLICATE_MEDIA_ENTRY",
    });
    await store.publish("safe-run");
    await expect(readFile(join(root, storageKey), "utf8")).resolves.toBe("first");
  });

  it("removes a partial file after interrupted staging so a retry can succeed", async () => {
    const { root, store } = await createStore();
    const interrupted = Readable.from((async function* () {
      yield "partial";
      throw new Error("connection interrupted");
    })());

    await expect(store.stage("safe-run", mediaEntry(interrupted))).rejects.toThrow("connection interrupted");
    const storageKey = await store.stage("safe-run", mediaEntry("complete"));
    await store.publish("safe-run");

    await expect(readFile(join(root, storageKey), "utf8")).resolves.toBe("complete");
  });

  it("discards only the named validated generation before or after publication", async () => {
    const { root, store } = await createStore();
    const keepKey = await store.stage("keep-run", mediaEntry("keep"));
    await store.publish("keep-run");
    await store.stage("drop-staged", mediaEntry("staged"));
    const publishedKey = await store.stage("drop-published", mediaEntry("published"));
    await store.publish("drop-published");

    await store.discard("drop-staged");
    await store.discard("drop-published");

    await expect(readFile(join(root, keepKey), "utf8")).resolves.toBe("keep");
    await expect(readFile(join(root, publishedKey))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
