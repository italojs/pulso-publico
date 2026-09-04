import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  BillAuthorRecord,
  BillRecord,
  IndividualVoteRecord,
  LawmakerRecord,
  MovementRecord,
  VoteEventRecord,
} from "#/domain/legislative";
import { LegislativeRepository } from "#/server/db/repositories";
import {
  bills,
  individualVotes,
  movements,
  sourceHealth,
  voteEvents,
} from "#/server/db/schema";
import {
  migrateTestDatabase,
  testDb,
  testSql,
  truncateLegislativeTables,
} from "../../setup-database.ts";

const checkedAt = "2026-09-03T18:00:00.000Z";
const bill = BillRecord.parse({
  source: "camara",
  externalId: "2351249",
  officialCode: "PEC 8/2025",
  congressionalKey: "pl:1106:2023",
  officialTitle: "Projeto de Lei 1106/2023",
  officialSummary: "Reconhece a robótica como esporte.",
  originHouse: "camara",
  currentHouse: "senado",
  statusCode: "926",
  statusLabel: "Aguardando parecer na comissão",
  officialUrl: "https://www.camara.leg.br/propostas-legislativas/2351249",
  presentedAt: "2023-03-14T14:46:00.000Z",
  checkedAt,
});
const lawmaker = LawmakerRecord.parse({
  source: "camara",
  externalId: "204485",
  name: "Luiz Carlos Motta",
  electoralName: "Luiz Carlos Motta",
  role: "deputado_federal",
  party: "PL",
  region: "SP",
  photoUrl: null,
  active: true,
  officialUrl: "https://www.camara.leg.br/deputados/204485",
  checkedAt,
});
const author = BillAuthorRecord.parse({
  source: "camara",
  externalId: "2351249:1:204485",
  billExternalId: "2351249",
  lawmakerExternalId: "204485",
  officialName: "Luiz Carlos Motta",
  party: "PL",
  authorKind: "Deputado(a)",
  isPrimary: true,
  officialUrl: "https://dadosabertos.camara.leg.br/api/v2/deputados/204485",
  checkedAt,
});
const movement = MovementRecord.parse({
  source: "camara",
  externalId: "2351249:79:2026-07-01T00:00:MESA",
  billExternalId: "2351249",
  occurredAt: "2026-07-01T03:00:00.000Z",
  sequence: 79,
  house: "camara",
  bodyCode: "MESA",
  bodyName: "Mesa Diretora",
  statusCode: "926",
  statusLabel: "Aguardando Apreciação pelo Senado Federal",
  officialDescription: "Remessa ao Senado Federal.",
  officialUrl: "https://www.camara.leg.br/propostas-legislativas/2351249",
  checkedAt,
});
const voteEvent = VoteEventRecord.parse({
  source: "camara",
  externalId: "2351249-1",
  billExternalId: "2351249",
  occurredAt: "2026-06-30T18:00:00.000Z",
  house: "camara",
  description: "Votação nominal.",
  result: "Aprovado",
  isNominal: true,
  isSecret: false,
  officialUrl: "https://dadosabertos.camara.leg.br/api/v2/votacoes/2351249-1",
  checkedAt,
});
const individualVote = IndividualVoteRecord.parse({
  source: "camara",
  externalId: "2351249-1:204485",
  voteEventExternalId: "2351249-1",
  lawmakerExternalId: "204485",
  choice: "sim",
  rawChoice: "Sim",
  officialUrl: "https://dadosabertos.camara.leg.br/api/v2/votacoes/2351249-1/votos",
  checkedAt,
});

function graph(overrides: Partial<typeof bill> = {}) {
  return {
    bill: { ...bill, ...overrides },
    authors: [author],
    topics: [],
    movements: [movement],
    voteEvents: [voteEvent],
    individualVotes: [individualVote],
  };
}

describe("LegislativeRepository", () => {
  const repository = new LegislativeRepository(testDb);

  beforeAll(migrateTestDatabase);
  beforeEach(truncateLegislativeTables);
  afterAll(() => testSql.end());

  it("upserts the same graph twice without duplicating official records", async () => {
    await repository.upsertLawmakers([lawmaker]);
    await repository.upsertBillGraph(graph());
    await repository.upsertBillGraph(graph());

    expect(await testDb.select({ id: bills.id }).from(bills)).toHaveLength(1);
    expect(await testDb.select({ id: movements.id }).from(movements)).toHaveLength(1);
    expect(await testDb.select({ id: voteEvents.id }).from(voteEvents)).toHaveLength(1);
    expect(
      await testDb.select({ id: individualVotes.id }).from(individualVotes),
    ).toHaveLength(1);
  });

  it("persists derived bill and vote filter facets", async () => {
    await repository.upsertLawmakers([lawmaker]);
    await repository.upsertBillGraph(graph());

    expect(await testDb.select({
      type: bills.proposalType,
      number: bills.proposalNumber,
      year: bills.proposalYear,
      stage: bills.simplifiedStage,
    }).from(bills)).toEqual([{ type: "PEC", number: 8, year: 2025, stage: "committees" }]);

    expect(await testDb.select({ category: voteEvents.resultCategory }).from(voteEvents))
      .toEqual([{ category: "approved" }]);
  });

  it("prefers structured proposal identity and falls back field by field", async () => {
    await repository.upsertLawmakers([lawmaker]);
    await repository.upsertBillGraph(graph({
      officialCode: "PRL 1/0",
      proposalType: "EMC-A",
      proposalNumber: 14,
      proposalYear: null,
    } as never));

    expect(await testDb.select({
      type: bills.proposalType,
      number: bills.proposalNumber,
      year: bills.proposalYear,
    }).from(bills)).toEqual([{ type: "EMC-A", number: 14, year: null }]);
  });

  it("updates official status while preserving the original row identity", async () => {
    await repository.upsertLawmakers([lawmaker]);
    await repository.upsertBillGraph(graph());
    const [before] = await testDb.select().from(bills);

    await repository.upsertBillGraph(
      graph({ statusCode: "1140", statusLabel: "Transformado em norma jurídica" }),
    );
    const [after] = await testDb.select().from(bills);

    expect(after?.id).toBe(before?.id);
    expect(after?.createdAt).toEqual(before?.createdAt);
    expect(after?.statusCode).toBe("1140");
    expect(after?.statusLabel).toBe("Transformado em norma jurídica");
  });

  it("rolls back the complete graph when a required lawmaker is absent", async () => {
    await expect(repository.upsertBillGraph(graph())).rejects.toThrow(/lawmaker/i);
    expect(await testDb.select().from(bills)).toHaveLength(0);
  });

  it("returns only referenced lawmakers that have not been stored", async () => {
    await repository.upsertLawmakers([lawmaker]);

    await expect(
      repository.findMissingLawmakerExternalIds("camara", ["204485", "220579"]),
    ).resolves.toEqual(["220579"]);
  });

  it("stores checkpoints and bounded source health state", async () => {
    const firstFailure = new Date("2026-09-03T18:00:00.000Z");
    await repository.saveCheckpoint("camara", firstFailure);
    await repository.markSourceFailure("camara", firstFailure, "HTTP_503");
    await repository.markSourceFailure(
      "camara",
      new Date("2026-09-03T18:30:00.000Z"),
      "unsafe error body that must not be stored",
    );

    expect(await repository.getCheckpoint("camara")).toEqual(firstFailure);
    const [failed] = await testDb
      .select()
      .from(sourceHealth)
      .where(eq(sourceHealth.source, "camara"))
      .orderBy(asc(sourceHealth.source));
    expect(failed).toMatchObject({
      consecutiveFailures: 2,
      lastErrorCode: "UNKNOWN",
    });

    await repository.markSourceSuccess(
      "camara",
      new Date("2026-09-03T19:00:00.000Z"),
    );
    const [healthy] = await testDb
      .select()
      .from(sourceHealth)
      .where(eq(sourceHealth.source, "camara"));
    expect(healthy).toMatchObject({ consecutiveFailures: 0, lastErrorCode: null });
  });
});
