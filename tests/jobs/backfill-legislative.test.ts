import { describe, expect, it, vi } from "vitest";

import type { Bill, LegislativeSourceAdapter } from "#/domain/legislative";
import { backfillLegislative } from "#/jobs/backfill-legislative";

function bill(year: number): Bill {
  return {
    source: "camara",
    externalId: String(year),
    officialCode: `PL ${year}/${year}`,
    proposalType: "PL",
    proposalNumber: year,
    proposalYear: year,
    congressionalKey: `pl:${year}:${year}`,
    officialTitle: `Projeto ${year}`,
    officialSummary: "Ementa",
    originHouse: "camara",
    currentHouse: "camara",
    statusCode: null,
    statusLabel: "Apresentado",
    officialUrl: `https://example.test/${year}`,
    presentedAt: `${year}-02-01T03:00:00.000Z`,
    checkedAt: "2026-09-06T20:00:00.000Z",
  };
}

describe("backfillLegislative", () => {
  it("imports calendar years in ascending order and records resumable checkpoints", async () => {
    const years: number[] = [];
    const adapter = {
      source: "camara",
      async *streamInitialBills(since: Date) {
        const year = since.getUTCFullYear();
        years.push(year);
        yield bill(year);
      },
    } as unknown as LegislativeSourceAdapter;
    const repository = {
      getHistoricalCheckpoint: vi.fn(async () => null),
      startHistoricalCheckpoint: vi.fn(async () => undefined),
      completeHistoricalCheckpoint: vi.fn(async () => undefined),
      failHistoricalCheckpoint: vi.fn(async () => undefined),
      upsertBillGraph: vi.fn(async () => undefined),
    };

    const report = await backfillLegislative(
      { camara: adapter },
      repository,
      { fromYear: 2019, throughYear: 2021, sources: ["camara"] },
    );

    expect(years).toEqual([2019, 2020, 2021]);
    expect(repository.upsertBillGraph).toHaveBeenCalledTimes(3);
    expect(repository.completeHistoricalCheckpoint).toHaveBeenCalledTimes(3);
    expect(report).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "camara", year: 2019, persisted: 1, status: "complete" }),
    ]));
  });

  it("skips completed years unless refresh is explicit", async () => {
    const adapter = { source: "camara", streamInitialBills: vi.fn() } as unknown as LegislativeSourceAdapter;
    const repository = {
      getHistoricalCheckpoint: vi.fn(async () => ({ status: "complete" as const })),
      startHistoricalCheckpoint: vi.fn(),
      completeHistoricalCheckpoint: vi.fn(),
      failHistoricalCheckpoint: vi.fn(),
      upsertBillGraph: vi.fn(),
    };

    const report = await backfillLegislative(
      { camara: adapter },
      repository,
      { fromYear: 2019, throughYear: 2019, sources: ["camara"] },
    );

    expect(report).toEqual([expect.objectContaining({ status: "skipped" })]);
    expect(repository.startHistoricalCheckpoint).not.toHaveBeenCalled();
  });

  it("uses bounded paginated search for adapters without bulk archives", async () => {
    const windows: Array<[string, string]> = [];
    const adapter = {
      source: "senado",
      listBillsChangedSince: vi.fn(async (since: Date, cursor?: string, until?: Date) => {
        windows.push([since.toISOString(), until!.toISOString()]);
        return { items: [], nextCursor: cursor ? null : "next" };
      }),
    } as unknown as LegislativeSourceAdapter;
    const repository = {
      getHistoricalCheckpoint: vi.fn(async () => null),
      startHistoricalCheckpoint: vi.fn(),
      completeHistoricalCheckpoint: vi.fn(),
      failHistoricalCheckpoint: vi.fn(),
      upsertBillGraph: vi.fn(),
    };

    await backfillLegislative(
      { senado: adapter },
      repository,
      { fromYear: 2019, throughYear: 2019, sources: ["senado"] },
    );

    expect(adapter.listBillsChangedSince).toHaveBeenCalledTimes(2);
    expect(windows).toEqual([
      ["2019-01-01T03:00:00.000Z", "2020-01-01T02:59:59.999Z"],
      ["2019-01-01T03:00:00.000Z", "2020-01-01T02:59:59.999Z"],
    ]);
  });
});
