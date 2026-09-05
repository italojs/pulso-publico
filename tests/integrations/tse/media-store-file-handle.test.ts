import { Readable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const fileHandleProbe = vi.hoisted(() => ({
  promiseOpenCalls: 0,
  callbackOpenCalls: 0,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: async (...arguments_: Parameters<typeof actual.open>) => {
      fileHandleProbe.promiseOpenCalls += 1;
      return actual.open(...arguments_);
    },
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    open: (...arguments_: Parameters<typeof actual.open>) => {
      fileHandleProbe.callbackOpenCalls += 1;
      return actual.open(...arguments_);
    },
  };
});

import { ElectoralMediaStore } from "#/integrations/tse/media-store";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  fileHandleProbe.promiseOpenCalls = 0;
  fileHandleProbe.callbackOpenCalls = 0;
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("ElectoralMediaStore file ownership", () => {
  it("delegates exclusive staged writes to WriteStream without manual descriptor ownership", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "electoral-media-handle-"));
    const store = new ElectoralMediaStore(temporaryDirectory);

    await expect(store.stage("safe-run", {
      kind: "governmentPlans",
      region: "ES",
      candidateExternalId: "260001234567",
      originalFilename: "2026ES260001234567_01.pdf",
      mimeType: "application/pdf",
      sourceArchiveUrl: "https://cdn.tse.jus.br/governmentPlans_ES.zip",
      content: Readable.from(["%PDF-1.7"]),
    })).resolves.toMatch(/governmentPlans/);

    expect(fileHandleProbe.promiseOpenCalls).toBe(0);
    expect(fileHandleProbe.callbackOpenCalls).toBe(0);
  });
});
