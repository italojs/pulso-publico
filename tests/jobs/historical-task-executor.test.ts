import { describe, expect, it } from "vitest";

import type {
  Bill,
  BillAuthor,
  BillTopic,
  LegislativeSourceAdapter,
  Movement,
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

function historicalTask(phase: "authors_topics" | "movements") {
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
