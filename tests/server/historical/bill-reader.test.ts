import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { bills, voteEvents } from "#/server/db/schema";
import { HistoricalBillReader } from "#/server/historical/bill-reader";
import {
  migrateTestDatabase,
  testDb,
  testSql,
  truncateLegislativeTables,
} from "../../setup-database.ts";

describe("HistoricalBillReader", () => {
  const reader = new HistoricalBillReader(testDb);

  beforeAll(migrateTestDatabase);
  beforeEach(truncateLegislativeTables);
  afterAll(() => testSql.end());

  it("returns one source/year in stable cursor order without changing official text", async () => {
    const checkedAt = new Date("2026-09-09T12:00:00.000Z");
    await testDb.insert(bills).values([
      {
        source: "camara",
        externalId: "100",
        officialCode: "PL 100/2026",
        proposalYear: 2026,
        officialTitle: "Título oficial A",
        officialSummary: "Ementa oficial A",
        originHouse: "camara",
        statusLabel: "Apresentado",
        officialUrl: "https://example.test/100",
        checkedAt,
      },
      {
        source: "camara",
        externalId: "101",
        officialCode: "PL 101/2026",
        proposalYear: 2026,
        officialTitle: "Título oficial B",
        officialSummary: "Ementa oficial B",
        originHouse: "camara",
        statusLabel: "Em análise",
        officialUrl: "https://example.test/101",
        checkedAt,
      },
      {
        source: "senado",
        externalId: "999",
        officialCode: "PL 999/2026",
        proposalYear: 2026,
        officialTitle: "Outra fonte",
        originHouse: "senado",
        statusLabel: "Apresentado",
        officialUrl: "https://example.test/999",
        checkedAt,
      },
    ]);

    const first = await reader.list({
      source: "camara",
      year: 2026,
      after: null,
      limit: 1,
    });
    const second = await reader.list({
      source: "camara",
      year: 2026,
      after: first[0]!.cursor,
      limit: 2,
    });

    expect(first).toHaveLength(1);
    expect(first[0]?.bill).toMatchObject({
      externalId: "100",
      officialTitle: "Título oficial A",
      officialSummary: "Ementa oficial A",
      checkedAt: checkedAt.toISOString(),
    });
    expect(second.map((item) => item.cursor)).toEqual(["101"]);
  });

  it("returns stored vote events with their parent bill in cursor order", async () => {
    const checkedAt = new Date("2026-09-09T12:00:00.000Z");
    const [storedBill] = await testDb.insert(bills).values({
      source: "senado",
      externalId: "900",
      officialCode: "PL 10/2026",
      proposalYear: 2026,
      officialTitle: "Título oficial",
      originHouse: "senado",
      statusLabel: "Em análise",
      officialUrl: "https://example.test/900",
      checkedAt,
    }).returning({ id: bills.id });
    await testDb.insert(voteEvents).values([
      {
        source: "senado",
        externalId: "vote-1",
        billId: storedBill!.id,
        occurredAt: checkedAt,
        house: "senado",
        description: "Votação pública",
        result: "Aprovado",
        isNominal: false,
        isSecret: false,
        officialUrl: "https://example.test/vote-1",
        checkedAt,
      },
      {
        source: "senado",
        externalId: "vote-2",
        billId: storedBill!.id,
        occurredAt: checkedAt,
        house: "senado",
        description: "Votação secreta",
        result: null,
        isNominal: false,
        isSecret: true,
        officialUrl: "https://example.test/vote-2",
        checkedAt,
      },
    ]);

    const rows = await reader.listVoteEvents({
      source: "senado",
      year: 2026,
      after: "vote-1",
      limit: 10,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cursor: "vote-2",
      bill: { externalId: "900", officialTitle: "Título oficial" },
      voteEvent: { externalId: "vote-2", isSecret: true },
    });
  });
});
