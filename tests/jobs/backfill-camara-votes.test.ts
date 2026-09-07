import { describe, expect, it, vi } from "vitest";

import {
  IndividualVoteRecord,
  LawmakerRecord,
  type ArchivedIndividualVote,
} from "#/domain/legislative";
import { backfillCamaraVotes } from "#/jobs/backfill-camara-votes";

const checkedAt = "2026-09-07T03:00:00.000Z";

function archivedVote(index: number): ArchivedIndividualVote {
  const voteEventExternalId = `vote-${index}`;
  const lawmakerExternalId = String(1000 + index);
  return {
    vote: IndividualVoteRecord.parse({
      source: "camara",
      externalId: `${voteEventExternalId}:${lawmakerExternalId}`,
      voteEventExternalId,
      lawmakerExternalId,
      choice: "sim",
      rawChoice: "Sim",
      officialUrl: `https://dadosabertos.camara.leg.br/api/v2/votacoes/${voteEventExternalId}/votos`,
      checkedAt,
    }),
    lawmaker: LawmakerRecord.parse({
      source: "camara",
      externalId: lawmakerExternalId,
      name: `Deputado ${index}`,
      electoralName: `Deputado ${index}`,
      role: "deputado_federal",
      party: "ABC",
      region: "SP",
      photoUrl: null,
      active: false,
      officialUrl: `https://www.camara.leg.br/deputados/${lawmakerExternalId}`,
      checkedAt,
    }),
  };
}

describe("backfillCamaraVotes", () => {
  it("imports an annual archive in bounded batches and records its checkpoint", async () => {
    const records = Array.from({ length: 501 }, (_, index) => archivedVote(index));
    const receivedIntervals: Array<[string, string]> = [];
    const adapter = {
      async *streamHistoricalIndividualVotes(since: Date, until: Date) {
        receivedIntervals.push([since.toISOString(), until.toISOString()]);
        yield* records;
      },
    };
    const batchSizes: number[] = [];
    const repository = {
      getHistoricalCheckpoint: vi.fn(async () => null),
      startHistoricalCheckpoint: vi.fn(),
      completeHistoricalCheckpoint: vi.fn(),
      failHistoricalCheckpoint: vi.fn(),
      upsertArchivedIndividualVotes: vi.fn(async (items: ArchivedIndividualVote[]) => {
        batchSizes.push(items.length);
        return items.length;
      }),
    };

    const reports = await backfillCamaraVotes(adapter, repository, {
      fromYear: 2019,
      throughYear: 2019,
      now: () => new Date("2026-09-07T03:00:00.000Z"),
    });

    expect(receivedIntervals).toEqual([
      ["2019-01-01T03:00:00.000Z", "2020-01-01T02:59:59.999Z"],
    ]);
    expect(batchSizes).toEqual([500, 1]);
    expect(repository.completeHistoricalCheckpoint).toHaveBeenCalledWith(
      "camara",
      "individual_votes",
      2019,
      501,
      501,
      expect.any(Date),
    );
    expect(reports).toEqual([
      expect.objectContaining({ year: 2019, read: 501, persisted: 501, status: "complete" }),
    ]);
  });

  it("skips a completed year unless refresh is requested", async () => {
    const adapter = { streamHistoricalIndividualVotes: vi.fn() };
    const repository = {
      getHistoricalCheckpoint: vi.fn(async () => ({ status: "complete" as const })),
      startHistoricalCheckpoint: vi.fn(),
      completeHistoricalCheckpoint: vi.fn(),
      failHistoricalCheckpoint: vi.fn(),
      upsertArchivedIndividualVotes: vi.fn(),
    };

    const reports = await backfillCamaraVotes(adapter, repository, {
      fromYear: 2019,
      throughYear: 2019,
    });

    expect(reports).toEqual([expect.objectContaining({ year: 2019, status: "skipped" })]);
    expect(adapter.streamHistoricalIndividualVotes).not.toHaveBeenCalled();
  });
});
