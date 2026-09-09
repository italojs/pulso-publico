import { describe, expect, it } from "vitest";

import type {
  ArchivedIndividualVote,
  Bill,
  BillAuthor,
  BillTopic,
  LegislativeSourceAdapter,
  IndividualVote,
  Movement,
  VoteEvent,
} from "#/domain/legislative";
import { collectCatalogPage } from "#/jobs/backfill-legislative";
import {
  createLegislativeHistoricalTaskExecutor,
  createHistoricalTaskExecutor,
  HistoricalTaskExecutionError,
} from "#/jobs/historical-task-executor";
import type { BillGraph } from "#/server/db/repositories";
import type { DatabaseTransaction } from "#/server/historical/task-repository";

const checkedAt = "2026-09-09T12:00:00.000Z";
const bill: Bill = {
  source: "camara",
  externalId: "100",
  officialCode: "PL 100/2026",
  proposalType: "PL",
  proposalNumber: 100,
  proposalYear: 2026,
  congressionalKey: null,
  officialTitle: "Projeto de teste",
  officialSummary: "Ementa oficial.",
  originHouse: "camara",
  currentHouse: "camara",
  statusCode: "1",
  statusLabel: "Apresentado",
  officialUrl: "https://example.test/bills/100",
  presentedAt: "2026-01-10T12:00:00.000Z",
  checkedAt,
};
const author: BillAuthor = {
  source: "camara",
  externalId: "100:author:1",
  billExternalId: "100",
  lawmakerExternalId: null,
  officialName: "Autora de teste",
  party: null,
  authorKind: "Deputada",
  isPrimary: true,
  officialUrl: "https://example.test/authors/1",
  checkedAt,
};
const topic: BillTopic = {
  source: "camara",
  externalId: "100:topic:1",
  billExternalId: "100",
  code: "TRAB",
  label: "Trabalho",
  officialUrl: "https://example.test/topics/TRAB",
  checkedAt,
};
const movement: Movement = {
  source: "camara",
  externalId: "100:movement:1",
  billExternalId: "100",
  occurredAt: "2026-02-10T12:00:00.000Z",
  sequence: 1,
  house: "camara",
  bodyCode: "CCJC",
  bodyName: "Comissão de Constituição e Justiça",
  statusCode: "2",
  statusLabel: "Em análise",
  officialDescription: "Recebido pela comissão.",
  officialUrl: "https://example.test/movements/1",
  checkedAt,
};
const voteEvent: VoteEvent = {
  source: "camara",
  externalId: "vote-1",
  billExternalId: "100",
  occurredAt: "2026-03-10T12:00:00.000Z",
  house: "camara",
  description: "Votação do requerimento.",
  result: "Aprovado",
  isNominal: true,
  isSecret: false,
  officialUrl: "https://example.test/votes/1",
  checkedAt,
};
const individualVote: IndividualVote = {
  source: "camara",
  externalId: "vote-1:member-1",
  voteEventExternalId: "vote-1",
  lawmakerExternalId: "member-1",
  choice: "sim",
  rawChoice: "Sim",
  officialUrl: "https://example.test/votes/1/members/1",
  checkedAt,
};

function adapter(overrides: Partial<LegislativeSourceAdapter> = {}): LegislativeSourceAdapter {
  const notUsed = async () => {
    throw new Error("unexpected adapter call");
  };
  return {
    source: "camara",
    listBillsChangedSince: notUsed,
    getBill: notUsed,
    listBillAuthors: async () => [],
    listBillTopics: async () => [],
    listBillMovements: async () => [],
    listBillVoteEvents: async () => [],
    listIndividualVotes: async () => [],
    listActiveLawmakers: notUsed,
    getLawmaker: notUsed,
    ...overrides,
  } as LegislativeSourceAdapter;
}

function historicalTask(
  phase:
    | "authors_topics"
    | "movements"
    | "vote_events"
    | "individual_votes"
    | "reconcile"
    | "validate",
) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    source: "camara" as const,
    year: 2026,
    phase,
    cursor: null,
    status: "running" as const,
    attempts: 1,
    recordsRead: 0,
    recordsPersisted: 0,
    leaseOwner: "worker",
    leaseExpiresAt: new Date("2026-09-09T12:05:00.000Z"),
    nextAttemptAt: null,
    lastErrorCode: null,
    startedAt: new Date(checkedAt),
    completedAt: null,
    createdAt: new Date(checkedAt),
    updatedAt: new Date(checkedAt),
  };
}

describe("createHistoricalTaskExecutor", () => {
  it("fails closed while a collection phase has no registered implementation", async () => {
    const executor = createHistoricalTaskExecutor({});

    await expect(executor.execute({ phase: "catalog" } as never)).rejects.toEqual(
      expect.objectContaining<Partial<HistoricalTaskExecutionError>>({
        code: "HISTORICAL_PHASE_NOT_IMPLEMENTED",
        retryable: false,
      }),
    );
  });

  it("persists authors and topics before advancing the bill cursor", async () => {
    let persistedGraph: BillGraph | null = null;
    const executor = createLegislativeHistoricalTaskExecutor({
      adapters: {
        camara: adapter({
          listBillAuthors: async () => [author],
          listBillTopics: async () => [topic],
        }),
      },
      billReader: { list: async () => [{ bill, cursor: bill.externalId }] },
      persistBillGraph: async (_transaction, graph) => {
        persistedGraph = graph;
      },
    });

    const result = await executor.execute(historicalTask("authors_topics"));
    expect(persistedGraph).toBeNull();
    await result.persist({} as DatabaseTransaction);

    expect(persistedGraph).toEqual({
      bill,
      authors: [author],
      topics: [topic],
      movements: [],
      voteEvents: [],
      individualVotes: [],
    });
    expect(result).toMatchObject({
      outcome: "progress",
      cursor: "100",
      read: 1,
      persisted: 2,
    });
  });

  it("persists movements without requesting unrelated resources", async () => {
    const requested: string[] = [];
    let persistedGraph: BillGraph | null = null;
    const executor = createLegislativeHistoricalTaskExecutor({
      adapters: {
        camara: adapter({
          listBillAuthors: async () => {
            requested.push("authors");
            return [];
          },
          listBillMovements: async () => {
            requested.push("movements");
            return [movement];
          },
        }),
      },
      billReader: { list: async () => [{ bill, cursor: bill.externalId }] },
      persistBillGraph: async (_transaction, graph) => {
        persistedGraph = graph;
      },
    });

    const result = await executor.execute(historicalTask("movements"));
    await result.persist({} as DatabaseTransaction);

    expect(requested).toEqual(["movements"]);
    expect(persistedGraph).toMatchObject({ movements: [movement] });
  });

  it("completes a detail phase when no bill remains after the cursor", async () => {
    const executor = createLegislativeHistoricalTaskExecutor({
      adapters: { camara: adapter() },
      billReader: { list: async () => [] },
      persistBillGraph: async () => undefined,
    });

    await expect(executor.execute(historicalTask("authors_topics"))).resolves
      .toMatchObject({ outcome: "complete", read: 0, persisted: 0 });
  });

  it("stores an empty public individual-vote collection as completed progress", async () => {
    const requestedVotes: string[] = [];
    let persistedGraph: BillGraph | null = null;
    const executor = createLegislativeHistoricalTaskExecutor({
      adapters: {
        camara: adapter({
          listIndividualVotes: async (externalId) => {
            requestedVotes.push(externalId);
            return [];
          },
        }),
      },
      billReader: { list: async () => [] },
      voteReader: {
        listVoteEvents: async () => [{ bill, voteEvent, cursor: voteEvent.externalId }],
      },
      persistBillGraph: async (_transaction, graph) => {
        persistedGraph = graph;
      },
      loadReferencedLawmakers: async () => [],
    });

    const result = await executor.execute(historicalTask("individual_votes"));
    await result.persist({} as DatabaseTransaction);

    expect(requestedVotes).toEqual(["vote-1"]);
    expect(result).toMatchObject({
      outcome: "progress",
      cursor: "vote-1",
      read: 1,
      persisted: 0,
    });
    expect(persistedGraph).toMatchObject({
      voteEvents: [voteEvent],
      individualVotes: [],
    });
  });

  it("uses the bounded Câmara archive after vote events have been collected", async () => {
    const archived: ArchivedIndividualVote = {
      vote: individualVote,
      lawmaker: {
        source: "camara",
        externalId: "member-1",
        name: "Pessoa Um",
        electoralName: "Pessoa Um",
        role: "deputado_federal",
        party: "ABC",
        region: "SP",
        photoUrl: null,
        active: false,
        officialUrl: "https://example.test/lawmakers/member-1",
        checkedAt,
      },
    };
    const archivedWrites: ArchivedIndividualVote[][] = [];
    const archiveAdapter = Object.assign(adapter(), {
      async *streamHistoricalIndividualVotes() {
        yield archived;
      },
    });
    const executor = createLegislativeHistoricalTaskExecutor({
      adapters: { camara: archiveAdapter },
      billReader: { list: async () => [] },
      persistBillGraph: async () => undefined,
      persistArchivedVotes: async (_transaction, items) => {
        archivedWrites.push([...items]);
        return items.length;
      },
    });

    const result = await executor.execute(historicalTask("individual_votes"));
    await result.persist({} as DatabaseTransaction);

    expect(result).toMatchObject({ outcome: "complete", read: 1, persisted: 1 });
    expect(archivedWrites).toEqual([[archived]]);
  });

  it("never requests individual votes for a secret event", async () => {
    const requestedVotes: string[] = [];
    const secretVote = { ...voteEvent, isSecret: true };
    const executor = createLegislativeHistoricalTaskExecutor({
      adapters: {
        camara: adapter({
          listIndividualVotes: async (externalId) => {
            requestedVotes.push(externalId);
            return [individualVote];
          },
        }),
      },
      billReader: { list: async () => [] },
      voteReader: {
        listVoteEvents: async () => [{ bill, voteEvent: secretVote, cursor: secretVote.externalId }],
      },
      persistBillGraph: async () => undefined,
      loadReferencedLawmakers: async () => [],
    });

    const result = await executor.execute(historicalTask("individual_votes"));
    await result.persist({} as DatabaseTransaction);

    expect(requestedVotes).toEqual([]);
    expect(result).toMatchObject({ outcome: "progress", persisted: 0 });
  });

  it("persists vote events separately from individual votes", async () => {
    let persistedGraph: BillGraph | null = null;
    const executor = createLegislativeHistoricalTaskExecutor({
      adapters: {
        camara: adapter({ listBillVoteEvents: async () => [voteEvent] }),
      },
      billReader: { list: async () => [{ bill, cursor: bill.externalId }] },
      persistBillGraph: async (_transaction, graph) => {
        persistedGraph = graph;
      },
    });

    const result = await executor.execute(historicalTask("vote_events"));
    await result.persist({} as DatabaseTransaction);

    expect(persistedGraph).toMatchObject({
      voteEvents: [voteEvent],
      individualVotes: [],
    });
  });

  it("fails validation with the stable integrity code", async () => {
    const executor = createLegislativeHistoricalTaskExecutor({
      adapters: { camara: adapter() },
      billReader: { list: async () => [] },
      persistBillGraph: async () => undefined,
      validateYear: async () => ({ valid: false, code: "ORPHAN_BILL_AUTHOR" }),
    });

    await expect(executor.execute(historicalTask("validate"))).rejects.toEqual(
      expect.objectContaining({ code: "ORPHAN_BILL_AUTHOR", retryable: false }),
    );
  });

  it("persists a newly resolved bicameral partner in the reconcile batch", async () => {
    let persistedGraph: BillGraph | null = null;
    const partner = {
      ...bill,
      source: "senado" as const,
      externalId: "900",
      originHouse: "camara" as const,
      currentHouse: "senado" as const,
    };
    const executor = createLegislativeHistoricalTaskExecutor({
      adapters: { camara: adapter() },
      billReader: { list: async () => [{ bill, cursor: bill.externalId }] },
      persistBillGraph: async (_transaction, graph) => {
        persistedGraph = graph;
      },
      resolveBicameralPartner: async () => ({
        source: "senado",
        externalId: "900",
        bill: partner,
      }),
    });

    const result = await executor.execute(historicalTask("reconcile"));
    await result.persist({} as DatabaseTransaction);

    expect(result).toMatchObject({ outcome: "progress", persisted: 1 });
    expect(persistedGraph).toMatchObject({ bill: partner });
  });
});

describe("collectCatalogPage", () => {
  it("resumes a Câmara archive after the last committed external id", async () => {
    const archiveItems = ["100", "101", "102"].map((externalId) => ({
      bill: { ...bill, externalId },
      authors: externalId === "100" ? [author] : [],
      topics: externalId === "100" ? [topic] : [],
    }));
    const archiveAdapter = Object.assign(adapter(), {
      async *streamInitialCatalog() {
        yield* archiveItems;
      },
    });

    const first = await collectCatalogPage(archiveAdapter, 2026, null, 2);
    const second = await collectCatalogPage(archiveAdapter, 2026, first.nextCursor, 2);

    expect(first).toMatchObject({
      complete: false,
      nextCursor: "archive:101",
      read: 2,
    });
    expect(first.graphs.map((graph) => graph.bill.externalId)).toEqual(["100", "101"]);
    expect(second).toMatchObject({ complete: true, nextCursor: null, read: 1 });
    expect(second.graphs.map((graph) => graph.bill.externalId)).toEqual(["102"]);
  });
});
