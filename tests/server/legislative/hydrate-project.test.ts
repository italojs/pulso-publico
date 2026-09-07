import { describe, expect, it, vi } from "vitest";

import type { LegislativeSourceAdapter } from "#/domain/legislative";
import { OfficialSourceError } from "#/server/http/retrying-fetch";
import {
  hydrateProject,
  type HydrationState,
} from "#/server/legislative/hydrate-project";

const now = new Date("2026-09-06T20:00:00.000Z");

function repository(initialState: HydrationState | null = null) {
  let state = initialState;
  return {
    getHydrationState: vi.fn(async () => state),
    touchHydrationRequest: vi.fn(async () => undefined),
    markHydrationRunning: vi.fn(async () => {
      state = { status: "running", detailsCheckedAt: null, updatedAt: now };
    }),
    markHydrationComplete: vi.fn(async () => {
      state = { status: "complete", detailsCheckedAt: now, updatedAt: now };
    }),
    markHydrationFailed: vi.fn(async () => undefined),
  };
}

const adapter = { source: "camara" } as LegislativeSourceAdapter;
const acquiredLock = async <T>(_name: string, operation: () => Promise<T>) => ({
  acquired: true as const,
  value: await operation(),
});

describe("hydrateProject", () => {
  it("uses recently completed details from the database", async () => {
    const repo = repository({
      status: "complete",
      detailsCheckedAt: new Date("2026-09-06T19:45:00.000Z"),
      updatedAt: new Date("2026-09-06T19:45:00.000Z"),
    });
    const persist = vi.fn();

    await expect(hydrateProject({
      source: "camara",
      externalId: "2233802",
      adapter,
      repository: repo,
      withLock: acquiredLock,
      persist,
      now,
    })).resolves.toEqual({ status: "cached" });
    expect(persist).not.toHaveBeenCalled();
    expect(repo.touchHydrationRequest).toHaveBeenCalledWith("camara", "2233802", now);
  });

  it("persists the complete graph before marking hydration complete", async () => {
    const repo = repository();
    const calls: string[] = [];
    repo.markHydrationRunning.mockImplementation(async () => { calls.push("running"); });
    repo.markHydrationComplete.mockImplementation(async () => { calls.push("complete"); });

    await expect(hydrateProject({
      source: "camara",
      externalId: "2233802",
      adapter,
      repository: repo,
      withLock: acquiredLock,
      persist: vi.fn(async () => { calls.push("persisted"); }),
      now,
    })).resolves.toEqual({ status: "complete" });
    expect(calls).toEqual(["running", "persisted", "complete"]);
  });

  it("records a bounded retry after an official-source failure", async () => {
    const repo = repository();

    await expect(hydrateProject({
      source: "camara",
      externalId: "2233802",
      adapter,
      repository: repo,
      withLock: acquiredLock,
      persist: vi.fn(async () => { throw new OfficialSourceError("unavailable", "https://example.test", 503, true); }),
      now,
    })).resolves.toEqual({ status: "failed", errorCode: "HTTP_503" });
    expect(repo.markHydrationFailed).toHaveBeenCalledWith(
      "camara",
      "2233802",
      now,
      new Date("2026-09-06T20:05:00.000Z"),
      "HTTP_503",
    );
    expect(repo.markHydrationComplete).not.toHaveBeenCalled();
  });

  it("surfaces programming and database errors instead of masking them as upstream failures", async () => {
    const repo = repository();

    await expect(hydrateProject({
      source: "camara",
      externalId: "2233802",
      adapter,
      repository: repo,
      withLock: acquiredLock,
      persist: vi.fn(async () => { throw new Error("database invariant failed"); }),
      now,
    })).rejects.toThrow("database invariant failed");
    expect(repo.markHydrationFailed).not.toHaveBeenCalled();
  });

  it("does not duplicate upstream work while another request owns the lock", async () => {
    const repo = repository();
    const persist = vi.fn();

    await expect(hydrateProject({
      source: "camara",
      externalId: "2233802",
      adapter,
      repository: repo,
      withLock: async () => ({ acquired: false as const }),
      persist,
      now,
    })).resolves.toEqual({ status: "busy" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("reuses data completed by another request before its lock is acquired", async () => {
    const repo = repository();
    repo.getHydrationState
      .mockResolvedValueOnce({
        status: "pending",
        detailsCheckedAt: null,
        updatedAt: new Date("2026-09-06T19:59:00.000Z"),
      })
      .mockResolvedValueOnce({
        status: "complete",
        detailsCheckedAt: new Date("2026-09-06T19:59:30.000Z"),
        updatedAt: new Date("2026-09-06T19:59:30.000Z"),
      });
    const persist = vi.fn();

    await expect(hydrateProject({
      source: "camara",
      externalId: "2233802",
      adapter,
      repository: repo,
      withLock: acquiredLock,
      persist,
      now,
    })).resolves.toEqual({ status: "cached" });
    expect(persist).not.toHaveBeenCalled();
    expect(repo.markHydrationRunning).not.toHaveBeenCalled();
  });
});
