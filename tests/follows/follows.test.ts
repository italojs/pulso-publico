import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FollowRepository } from "#/follows/follow-repository";
import { parseLocalFollows, toggleLocalFollow } from "#/follows/local";
import {
  bills,
  electoralCandidates,
  electoralSyncRuns,
  followedBills,
  followedCandidates,
  followedLawmakers,
  lawmakers,
  users,
} from "#/server/db/schema";
import { migrateTestDatabase, testDb, testSql, truncateLegislativeTables } from "../setup-database.ts";

const snapshotTime = new Date("2026-09-05T12:00:00.000Z");

async function insertSuccessfulSnapshot(runId: string, candidateExternalIds: string[]) {
  await testDb.insert(electoralSyncRuns).values({
    syncRunId: runId,
    electionYear: 2026,
    status: "successful",
    startedAt: snapshotTime,
    completedAt: snapshotTime,
    extractedAt: snapshotTime,
  });
  if (candidateExternalIds.length === 0) return [];
  return testDb.insert(electoralCandidates).values(candidateExternalIds.map((externalId, index) => ({
    electionYear: 2026,
    externalId,
    snapshotRunId: runId,
    fullName: `PESSOA CANDIDATA ${index + 1}`,
    ballotName: `CANDIDATURA ${externalId}`,
    number: 1200 + index,
    office: "deputado_federal" as const,
    round: 1,
    region: "ES",
    electoralUnit: "ESPIRITO SANTO",
    status: "APTO",
    partyAcronym: "ABC",
    partyNumber: 12,
    partyName: "PARTIDO ABC",
    seekingReelection: false,
    officialUrl: `https://divulgacandcontas.tse.jus.br/candidato/${externalId}`,
    sourceExtractedAt: snapshotTime,
    checkedAt: snapshotTime,
  }))).returning();
}

beforeAll(migrateTestDatabase);
beforeEach(truncateLegislativeTables);
afterAll(() => testSql.end());

describe("followed items", () => {
  it("parses only valid local records and toggles idempotently", () => {
    const item = { kind: "bill" as const, source: "camara" as const, externalId: "8001", label: "PL 1/2026", href: "/projetos/camara/8001" };
    const followed = toggleLocalFollow([], item, true);

    expect(toggleLocalFollow(followed, item, true)).toEqual(followed);
    expect(toggleLocalFollow(followed, item, false)).toEqual([]);
    expect(parseLocalFollows(JSON.stringify([...followed, { kind: "invalid" }]))).toEqual(followed);
    expect(parseLocalFollows(JSON.stringify([{
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001234567",
      label: "CANDIDATURA 260001234567",
      href: "/candidatos/2026/260001234567",
    }]))).toEqual([]);
  });

  it("follows projects and lawmakers, preserving enabled alerts on sync", async () => {
    const [user] = await testDb.insert(users).values({ email: "follow@example.com", passwordHash: "hash" }).returning();
    const [bill] = await testDb.insert(bills).values({
      source: "camara", externalId: "8001", officialCode: "PL 1/2026", officialTitle: "Projeto teste", officialSummary: "Ementa teste",
      originHouse: "camara", currentHouse: "camara", statusLabel: "Em análise", officialUrl: "https://example.com/bill", checkedAt: new Date(),
    }).returning();
    const [lawmaker] = await testDb.insert(lawmakers).values({
      source: "senado", externalId: "8101", name: "Pessoa Política", electoralName: "Pessoa Política", role: "senador", party: "ABC", region: "PE", active: true, officialUrl: "https://example.com/lawmaker", checkedAt: new Date(),
    }).returning();
    if (!user || !bill || !lawmaker) throw new Error("fixture failed");
    const repository = new FollowRepository(testDb);

    await expect(repository.follow(user.id, { kind: "bill", source: "camara", externalId: "8001", alertsEnabled: true })).resolves.toBe(true);
    await repository.sync(user.id, [
      { kind: "bill", source: "camara", externalId: "8001" },
      { kind: "lawmaker", source: "senado", externalId: "8101" },
    ]);
    const items = await repository.list(user.id);

    expect(items).toHaveLength(2);
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "bill", externalId: "8001", alertsEnabled: true }),
      expect.objectContaining({ kind: "lawmaker", externalId: "8101" }),
    ]));
    await repository.unfollow(user.id, { kind: "bill", source: "camara", externalId: "8001" });
    expect(await repository.list(user.id)).toHaveLength(1);
  });

  it("follows only a candidate in the latest successful snapshot and stays idempotent", async () => {
    const [user] = await testDb.insert(users).values({ email: "candidate@example.com", passwordHash: "hash" }).returning();
    await insertSuccessfulSnapshot("stale-follow-run", ["260001000001"]);
    await insertSuccessfulSnapshot("current-follow-run", ["260001000002"]);
    await testDb.insert(electoralSyncRuns).values({
      syncRunId: "newer-failed-follow-run",
      electionYear: 2026,
      status: "failed",
      startedAt: snapshotTime,
      completedAt: snapshotTime,
      errorCode: "OFFICIAL_RESOURCE_UNAVAILABLE",
    });
    if (!user) throw new Error("fixture failed");
    const repository = new FollowRepository(testDb);

    await expect(repository.follow(user.id, {
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001000002",
    })).resolves.toBe(true);
    await expect(repository.follow(user.id, {
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001000002",
    })).resolves.toBe(true);
    await expect(repository.follow(user.id, {
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001000001",
    })).resolves.toBe(false);
    await expect(repository.follow(user.id, {
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001999999",
    })).resolves.toBe(false);

    const items = await repository.list(user.id);
    expect(items).toEqual([{
      kind: "candidate",
      provider: "tse",
      electionYear: 2026,
      externalId: "260001000002",
      label: "CANDIDATURA 260001000002",
      subtitle: "Deputado federal · ABC · ES",
      href: "/candidatos/2026/260001000002",
      followedAt: expect.any(String),
    }]);
    expect(() => JSON.stringify(items)).not.toThrow();
    expect(await testDb.select().from(followedCandidates)).toHaveLength(1);
  });

  it("keeps candidate unfollow isolated to the requesting account", async () => {
    const [firstUser, secondUser] = await testDb.insert(users).values([
      { email: "first-candidate@example.com", passwordHash: "hash" },
      { email: "second-candidate@example.com", passwordHash: "hash" },
    ]).returning();
    await insertSuccessfulSnapshot("shared-current-run", ["260001000003"]);
    if (!firstUser || !secondUser) throw new Error("fixture failed");
    const repository = new FollowRepository(testDb);
    const reference = { kind: "candidate" as const, electionYear: 2026, externalId: "260001000003" };

    await repository.follow(firstUser.id, reference);
    await repository.follow(secondUser.id, reference);
    await repository.unfollow(firstUser.id, reference);

    expect(await repository.list(firstUser.id)).toEqual([]);
    expect(await repository.list(secondUser.id)).toEqual([
      expect.objectContaining({ kind: "candidate", externalId: "260001000003" }),
    ]);
  });

  it("keeps an existing candidate follow truthful after the candidacy leaves the current snapshot", async () => {
    const [user] = await testDb.insert(users).values({ email: "stale-list@example.com", passwordHash: "hash" }).returning();
    await insertSuccessfulSnapshot("first-current-run", ["260001000004"]);
    if (!user) throw new Error("fixture failed");
    const repository = new FollowRepository(testDb);
    await repository.follow(user.id, { kind: "candidate", electionYear: 2026, externalId: "260001000004" });
    await insertSuccessfulSnapshot("replacement-current-run", ["260001000005"]);

    expect(await repository.list(user.id)).toEqual([
      expect.objectContaining({
        kind: "candidate",
        provider: "tse",
        electionYear: 2026,
        externalId: "260001000004",
        label: "CANDIDATURA 260001000004",
      }),
    ]);
  });

  it("merges all follow kinds in reverse chronology with a deterministic global tie break", async () => {
    const [user] = await testDb.insert(users).values({ email: "ordered@example.com", passwordHash: "hash" }).returning();
    await testDb.insert(bills).values({
      source: "camara", externalId: "same", officialCode: "PL 10/2026", officialTitle: "Projeto", officialSummary: "Resumo",
      originHouse: "camara", currentHouse: "camara", statusLabel: "Em análise", officialUrl: "https://example.com/bill", checkedAt: snapshotTime,
    });
    await testDb.insert(lawmakers).values({
      source: "senado", externalId: "same", name: "Pessoa Política", electoralName: "Pessoa Política", role: "senador",
      party: "ABC", region: "ES", active: true, officialUrl: "https://example.com/lawmaker", checkedAt: snapshotTime,
    });
    await insertSuccessfulSnapshot("ordered-current-run", ["same"]);
    if (!user) throw new Error("fixture failed");
    const repository = new FollowRepository(testDb);
    await repository.follow(user.id, { kind: "lawmaker", source: "senado", externalId: "same" });
    await repository.follow(user.id, { kind: "candidate", electionYear: 2026, externalId: "same" });
    await repository.follow(user.id, { kind: "bill", source: "camara", externalId: "same" });
    const tiedAt = new Date("2026-09-05T13:00:00.000Z");
    await Promise.all([
      testDb.update(followedBills).set({ createdAt: tiedAt }).where(eq(followedBills.userId, user.id)),
      testDb.update(followedCandidates).set({ createdAt: new Date("2026-09-05T14:00:00.000Z") }).where(eq(followedCandidates.userId, user.id)),
      testDb.update(followedLawmakers).set({ createdAt: tiedAt }).where(eq(followedLawmakers.userId, user.id)),
    ]);

    const identities = (await repository.list(user.id)).map((item) => item.kind);
    expect(identities).toEqual(["candidate", "bill", "lawmaker"]);
    expect((await repository.list(user.id)).map((item) => item.kind)).toEqual(identities);
    expect((await testDb.execute(sql`select count(*)::integer as count from followed_candidates`))[0]?.count).toBe(1);
  });
});
