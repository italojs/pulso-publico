import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CandidateAssetRecord,
  CandidateDocumentRecord,
  CandidateGovernmentPlanRecord,
  CandidateSocialLinkRecord,
  CampaignEntryRecord,
  ElectoralCandidateRecord,
} from "#/domain/electoral";
import {
  ElectoralRepository,
  type ElectoralSnapshotCandidate,
  type ElectoralSnapshot,
} from "#/server/electoral/repository";
import {
  candidateAssets,
  candidateCampaignTotals,
  candidateDocuments,
  candidateGovernmentPlans,
  candidateLawmakerLinks,
  electoralCandidates,
  electoralSyncRuns,
  followedCandidates,
  lawmakers,
  users,
} from "#/server/db/schema";
import * as databaseSchema from "#/server/db/schema";
import {
  migrateTestDatabase,
  testDb,
  testSql,
  truncateLegislativeTables,
} from "../../setup-database.ts";

const checkedAt = "2026-09-05T12:00:00.000Z";
const sourceExtractedAt = "2026-09-05T11:30:00.000Z";
const databaseUrl = process.env.DATABASE_URL!;

function candidate(
  externalId: string,
  overrides: Partial<ElectoralSnapshotCandidate> = {},
): ElectoralSnapshotCandidate {
  return {
    ...ElectoralCandidateRecord.parse({
      electionYear: 2026,
      externalId,
      fullName: `Pessoa Candidata ${externalId}`,
      ballotName: `Pessoa ${externalId.slice(-2)}`,
      socialName: null,
      number: Number(externalId.slice(-2)),
      office: "deputado_federal",
      round: 1,
      region: "ES",
      electoralUnit: "ESPÍRITO SANTO",
      status: "APTO",
      statusDetail: null,
      partyAcronym: "ABC",
      partyNumber: 10,
      partyName: "Partido ABC",
      federation: null,
      coalition: null,
      seekingReelection: false,
      birthDate: "1980-04-03",
      ageAtInauguration: 46,
      gender: "FEMININO",
      race: "PARDA",
      education: "SUPERIOR COMPLETO",
      occupation: "PROFESSORA",
      maritalStatus: "SOLTEIRA",
      nationality: "BRASILEIRA NATA",
      birthRegion: "ES",
      birthCity: "VITÓRIA",
      officialUrl: `https://divulgacandcontas.tse.jus.br/candidato/${externalId}`,
      checkedAt,
    }),
    photoStorageKey: `run-2026-01/photos/${externalId}/foto.jpg`,
    photoSourceArchiveUrl: "https://cdn.tse.jus.br/fotos.zip",
    photoOriginalFilename: "foto.jpg",
    photoMimeType: "image/jpeg",
    photoSourceExtractedAt: sourceExtractedAt,
    photoCheckedAt: checkedAt,
    ...overrides,
  };
}

const primaryCandidateId = "260001234567";

function snapshot(
  syncRunId: string,
  candidates = [candidate(primaryCandidateId)],
): ElectoralSnapshot {
  return {
    syncRunId,
    electionYear: 2026,
    extractedAt: new Date(sourceExtractedAt),
    candidates,
    assets: [
      CandidateAssetRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        category: "Apartamento",
        description: "Imóvel residencial",
        valueCents: 25_000_000n,
      }),
      CandidateAssetRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        category: "Veículo",
        description: null,
        valueCents: 0n,
      }),
    ],
    campaignEntries: [
      CampaignEntryRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        kind: "receipt",
        category: "Recursos próprios",
        valueCents: 0n,
      }),
    ],
    socialLinks: [
      CandidateSocialLinkRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        label: "Site",
        url: "https://candidata.example.test/",
      }),
    ],
    governmentPlans: [{
      ...CandidateGovernmentPlanRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        officialUrl: "https://cdn.tse.jus.br/plano.pdf",
        storageKey: "run-2026-01/governmentPlans/260001234567/plano.pdf",
        originalFilename: "plano.pdf",
        sourceExtractedAt,
        checkedAt,
      }),
      mimeType: "application/pdf",
      sourceArchiveUrl: "https://cdn.tse.jus.br/planos.zip",
    }],
    documents: [{
      ...CandidateDocumentRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        label: "Certidão pública",
        officialUrl: "https://cdn.tse.jus.br/certidao.pdf",
        storageKey: "run-2026-01/certificates/260001234567/certidao.pdf",
        originalFilename: "certidao.pdf",
        sourceExtractedAt,
        checkedAt,
      }),
      mimeType: "application/pdf",
      sourceArchiveUrl: "https://cdn.tse.jus.br/certidoes.zip",
    }],
  };
}

function snapshotForElection(syncRunId: string, electionYear: number): ElectoralSnapshot {
  const value = snapshot(syncRunId, [candidate(primaryCandidateId, { electionYear })]);
  value.electionYear = electionYear;
  value.assets = value.assets.map((item) => ({ ...item, electionYear }));
  value.campaignEntries = value.campaignEntries.map((item) => ({ ...item, electionYear }));
  value.socialLinks = value.socialLinks.map((item) => ({ ...item, electionYear }));
  value.governmentPlans = value.governmentPlans.map((item) => ({ ...item, electionYear }));
  value.documents = value.documents.map((item) => ({ ...item, electionYear }));
  return value;
}

async function waitUntil(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for concurrent database state");
}

async function seedLawmakerAndUser() {
  const [lawmaker] = await testDb.insert(lawmakers).values({
    source: "camara",
    externalId: "220530",
    name: "Pessoa Candidata",
    electoralName: "Pessoa Candidata",
    role: "deputado_federal",
    party: "ABC",
    region: "ES",
    photoUrl: null,
    active: true,
    officialUrl: "https://dadosabertos.camara.leg.br/api/v2/deputados/220530",
    checkedAt: new Date(checkedAt),
  }).returning({ id: lawmakers.id });
  const [user] = await testDb.insert(users).values({
    email: "pessoa@example.test",
    passwordHash: "hash-for-integration-test",
  }).returning({ id: users.id });
  if (!lawmaker || !user) throw new Error("Failed to seed test identities");
  return { lawmakerId: lawmaker.id, userId: user.id };
}

describe("ElectoralRepository", () => {
  const repository = new ElectoralRepository(testDb);

  beforeAll(migrateTestDatabase);
  beforeEach(truncateLegislativeTables);
  afterAll(() => testSql.end());

  it("publishes one complete snapshot idempotently while retaining an explicit zero", async () => {
    const candidateSnapshot = snapshot("run-2026-01");

    await repository.persistSnapshot(candidateSnapshot);
    await repository.persistSnapshot(candidateSnapshot);

    expect(await testDb.select({ id: electoralCandidates.id }).from(electoralCandidates)).toHaveLength(1);
    expect(await testDb.select({ id: candidateAssets.id }).from(candidateAssets)).toHaveLength(2);
    expect(await testDb.select({ id: electoralSyncRuns.syncRunId }).from(electoralSyncRuns)).toHaveLength(1);
    expect(await testDb.select({
      storageKey: electoralCandidates.photoStorageKey,
      sourceArchiveUrl: electoralCandidates.photoSourceArchiveUrl,
      originalFilename: electoralCandidates.photoOriginalFilename,
      mimeType: electoralCandidates.photoMimeType,
    }).from(electoralCandidates)).toEqual([{
      storageKey: "run-2026-01/photos/260001234567/foto.jpg",
      sourceArchiveUrl: "https://cdn.tse.jus.br/fotos.zip",
      originalFilename: "foto.jpg",
      mimeType: "image/jpeg",
    }]);
    expect(await testDb.select({
      storageKey: candidateGovernmentPlans.storageKey,
      sourceArchiveUrl: candidateGovernmentPlans.sourceArchiveUrl,
      originalFilename: candidateGovernmentPlans.originalFilename,
      mimeType: candidateGovernmentPlans.mimeType,
    }).from(candidateGovernmentPlans)).toEqual([{
      storageKey: "run-2026-01/governmentPlans/260001234567/plano.pdf",
      sourceArchiveUrl: "https://cdn.tse.jus.br/planos.zip",
      originalFilename: "plano.pdf",
      mimeType: "application/pdf",
    }]);
    expect(await testDb.select({ storageKey: candidateDocuments.storageKey }).from(candidateDocuments))
      .toEqual([{ storageKey: "run-2026-01/certificates/260001234567/certidao.pdf" }]);
    expect(await testDb.select({
      revenueCents: candidateCampaignTotals.revenueCents,
      expenseCents: candidateCampaignTotals.expenseCents,
    }).from(candidateCampaignTotals)).toEqual([{
      revenueCents: 0n,
      expenseCents: null,
    }]);
  });

  it("normalizes campaign provenance before treating reordered entries as an equivalent retry", async () => {
    const provenanceA = {
      ...CampaignEntryRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        kind: "receipt",
        category: "Doações",
        valueCents: 100n,
      }),
      sourceArchiveUrl: "https://cdn.tse.jus.br/campaign-a.zip",
      sourceExtractedAt: "2026-09-05T09:00:00.000Z",
      checkedAt: "2026-09-05T10:00:00.000Z",
    };
    const provenanceB = {
      ...CampaignEntryRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        kind: "receipt",
        category: "Doações",
        valueCents: 200n,
      }),
      sourceArchiveUrl: "https://cdn.tse.jus.br/campaign-b.zip",
      sourceExtractedAt: "2026-09-05T10:00:00.000Z",
      checkedAt: "2026-09-05T11:00:00.000Z",
    };
    const firstAttempt = snapshot("campaign-provenance-run");
    firstAttempt.campaignEntries = [provenanceB, provenanceA];
    const reorderedRetry = snapshot("campaign-provenance-run");
    reorderedRetry.campaignEntries = [provenanceA, provenanceB];

    await repository.persistSnapshot(firstAttempt);
    await expect(repository.persistSnapshot(reorderedRetry)).resolves.toBeUndefined();

    expect(await testDb.select({
      sourceArchiveUrl: candidateCampaignTotals.sourceArchiveUrl,
      sourceExtractedAt: candidateCampaignTotals.sourceExtractedAt,
      checkedAt: candidateCampaignTotals.checkedAt,
    }).from(candidateCampaignTotals)).toEqual([{
      sourceArchiveUrl: "https://cdn.tse.jus.br/campaign-a.zip",
      sourceExtractedAt: new Date("2026-09-05T09:00:00.000Z"),
      checkedAt: new Date("2026-09-05T10:00:00.000Z"),
    }]);
  });

  it("serializes concurrent publications and rejects an older run after the newer run commits", async () => {
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const triggerName = `test_electoral_gate_${suffix}`;
    const functionName = `test_electoral_gate_fn_${suffix}`;
    const newerRunId = `concurrent-new-${suffix}`;
    const olderRunId = `concurrent-old-${suffix}`;
    const lockNamespace = 7_311;
    const lockKey = Number.parseInt(suffix.slice(0, 7), 16);
    const controlPool = postgres(databaseUrl, { max: 1 });
    const newerPool = postgres(databaseUrl, { max: 1 });
    const olderPool = postgres(databaseUrl, { max: 1 });
    const observer = postgres(databaseUrl, { max: 1 });
    const control = await controlPool.reserve();
    let controlLockHeld = false;

    try {
      await observer.unsafe(`
        CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.sync_run_id = '${newerRunId}' AND NEW.status = 'successful' THEN
            PERFORM pg_advisory_xact_lock(${lockNamespace}, ${lockKey});
          END IF;
          RETURN NEW;
        END
        $$
      `);
      await observer.unsafe(`
        CREATE TRIGGER "${triggerName}"
        BEFORE UPDATE ON electoral_sync_runs
        FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
      `);
      await control`select pg_advisory_lock(${lockNamespace}, ${lockKey})`;
      controlLockHeld = true;
      await newerPool`select set_config('application_name', ${`task3-newer-${suffix}`}, false)`;
      await olderPool`select set_config('application_name', ${`task3-older-${suffix}`}, false)`;

      const newerSnapshot = snapshot(newerRunId, [candidate(primaryCandidateId, {
        status: "SNAPSHOT NOVO",
      })]);
      newerSnapshot.extractedAt = new Date("2026-09-05T12:00:00.000Z");
      const olderSnapshot = snapshot(olderRunId, [candidate(primaryCandidateId, {
        status: "SNAPSHOT ANTIGO",
      })]);
      olderSnapshot.extractedAt = new Date("2026-09-05T11:00:00.000Z");
      const newerRepository = new ElectoralRepository(drizzle(newerPool, { schema: databaseSchema }));
      const olderRepository = new ElectoralRepository(drizzle(olderPool, { schema: databaseSchema }));

      const newerPublication = newerRepository.persistSnapshot(newerSnapshot);
      await waitUntil(async () => {
        const [row] = await observer<{ waiting: boolean }[]>`
          select exists (
            select 1 from pg_stat_activity
            where application_name = ${`task3-newer-${suffix}`}
              and wait_event_type = 'Lock'
          ) as waiting
        `;
        return row?.waiting === true;
      });

      const olderPublication = olderRepository.persistSnapshot(olderSnapshot);
      await waitUntil(async () => {
        const [row] = await observer<{ waiting: boolean }[]>`
          select exists (
            select 1 from pg_stat_activity
            where application_name = ${`task3-older-${suffix}`}
              and wait_event_type = 'Lock'
          ) as waiting
        `;
        return row?.waiting === true;
      });

      await control`select pg_advisory_unlock(${lockNamespace}, ${lockKey})`;
      controlLockHeld = false;
      const [newerResult, olderResult] = await Promise.allSettled([
        newerPublication,
        olderPublication,
      ]);

      expect(newerResult).toMatchObject({ status: "fulfilled" });
      expect(olderResult).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({ message: "Cannot publish a stale electoral snapshot" }),
      });
      await expect(repository.findCandidate(2026, primaryCandidateId)).resolves.toMatchObject({
        status: "SNAPSHOT NOVO",
        snapshotRunId: newerRunId,
      });
    } finally {
      if (controlLockHeld) {
        await control`select pg_advisory_unlock(${lockNamespace}, ${lockKey})`;
      }
      await Promise.allSettled([
        observer.unsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON electoral_sync_runs`),
      ]);
      await Promise.allSettled([
        observer.unsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`),
      ]);
      control.release();
      await Promise.all([
        controlPool.end({ timeout: 5 }),
        newerPool.end({ timeout: 5 }),
        olderPool.end({ timeout: 5 }),
        observer.end({ timeout: 5 }),
      ]);
    }
  }, 15_000);

  it("reads the latest successful run and candidate in one database statement", async () => {
    await repository.persistSnapshot(snapshot("run-2026-01"));
    const statements: string[] = [];
    const readSql = postgres(databaseUrl, {
      max: 1,
      debug(_connection, query) {
        statements.push(query);
      },
    });

    try {
      const readRepository = new ElectoralRepository(drizzle(readSql, { schema: databaseSchema }));
      await readRepository.findCandidate(2026, primaryCandidateId);
      statements.length = 0;
      await expect(readRepository.findCandidate(2026, primaryCandidateId)).resolves.toMatchObject({
        externalId: primaryCandidateId,
      });
      expect(statements.filter((statement) => /^select\b/i.test(statement.trim()))).toHaveLength(1);
    } finally {
      await readSql.end({ timeout: 5 });
    }
  });

  it("uses a total order to resolve successful runs with identical timestamps", async () => {
    const first = snapshot("same-time-a");
    first.extractedAt = new Date("2026-09-05T15:00:00.000Z");
    await repository.persistSnapshot(first);
    const second = snapshot("same-time-z", [candidate(primaryCandidateId, {
      status: "DESEMPATE DETERMINÍSTICO",
    })]);
    second.extractedAt = first.extractedAt;
    await repository.persistSnapshot(second);
    const tiedAt = new Date("2026-09-05T15:30:00.000Z");
    await testDb.update(electoralSyncRuns).set({ completedAt: tiedAt })
      .where(eq(electoralSyncRuns.electionYear, 2026));
    const runs = await testDb.select({
      syncRunId: electoralSyncRuns.syncRunId,
      publicationOrder: electoralSyncRuns.publicationOrder,
    }).from(electoralSyncRuns).orderBy(electoralSyncRuns.publicationOrder);

    expect(runs.map(({ syncRunId }) => syncRunId)).toEqual(["same-time-a", "same-time-z"]);
    expect(runs[0]!.publicationOrder < runs[1]!.publicationOrder).toBe(true);
    await expect(repository.findCandidate(2026, primaryCandidateId)).resolves.toMatchObject({
      status: "DESEMPATE DETERMINÍSTICO",
      snapshotRunId: "same-time-z",
    });
  });

  it("rejects reuse of a successful run id with a different payload", async () => {
    await repository.persistSnapshot(snapshot("immutable-run"));
    const incompatible = snapshot("immutable-run", [candidate(primaryCandidateId, {
      status: "PAYLOAD DIFERENTE",
    })]);

    await expect(repository.persistSnapshot(incompatible)).rejects.toThrow(/different payload/i);
    await expect(repository.findCandidate(2026, primaryCandidateId)).resolves.toMatchObject({
      status: "APTO",
      snapshotRunId: "immutable-run",
    });
  });

  it("rejects reuse of a run id by another election", async () => {
    await repository.persistSnapshot(snapshot("immutable-run"));

    await expect(repository.persistSnapshot(snapshotForElection("immutable-run", 2027)))
      .rejects.toThrow(/already belongs to election 2026/i);
    expect(await testDb.select({
      electionYear: electoralSyncRuns.electionYear,
      status: electoralSyncRuns.status,
    }).from(electoralSyncRuns).where(eq(electoralSyncRuns.syncRunId, "immutable-run")))
      .toEqual([{ electionYear: 2026, status: "successful" }]);
  });

  it("keeps the previous public snapshot when persistence fails", async () => {
    const first = snapshot("run-2026-01");
    await repository.persistSnapshot(first);
    const invalid = snapshot("run-2026-02");
    invalid.assets.push(invalid.assets[0]!);

    await expect(repository.persistSnapshot(invalid)).rejects.toThrow(/duplicate asset/i);

    await expect(repository.findCandidate(2026, primaryCandidateId)).resolves.toMatchObject({
      externalId: primaryCandidateId,
      snapshotRunId: "run-2026-01",
    });
    expect(await testDb.select({ syncRunId: electoralSyncRuns.syncRunId }).from(electoralSyncRuns))
      .toEqual([{ syncRunId: "run-2026-01" }]);
  });

  it("rolls back candidate and child replacement when a database constraint fails", async () => {
    await repository.persistSnapshot(snapshot("run-2026-01"));
    const invalid = snapshot("run-2026-02", [candidate(primaryCandidateId, {
      status: "NÃO DEVE VAZAR",
    })]);
    invalid.socialLinks.push(invalid.socialLinks[0]!);

    await expect(repository.persistSnapshot(invalid)).rejects.toThrow(/candidate_social_links/);

    await expect(repository.findCandidate(2026, primaryCandidateId)).resolves.toMatchObject({
      status: "APTO",
      snapshotRunId: "run-2026-01",
    });
    expect(await testDb.select({ syncRunId: electoralSyncRuns.syncRunId }).from(electoralSyncRuns))
      .toEqual([{ syncRunId: "run-2026-01" }]);
  });

  it("exposes a lawmaker only after the link is confirmed", async () => {
    await repository.persistSnapshot(snapshot("run-2026-01"));
    const [storedCandidate] = await testDb.select({ id: electoralCandidates.id })
      .from(electoralCandidates);
    if (!storedCandidate) throw new Error("Candidate was not persisted");
    const candidateId = storedCandidate.id;
    const { lawmakerId } = await seedLawmakerAndUser();

    await repository.createPendingLawmakerLink(
      candidateId!,
      lawmakerId,
      "exact_name_region_party_office",
    );
    await expect(repository.findConfirmedLawmaker(candidateId!)).resolves.toBeNull();

    await repository.confirmLawmakerLink(
      candidateId!,
      lawmakerId,
      "https://dadosabertos.camara.leg.br/api/v2/deputados/220530",
      new Date("2026-09-05T13:00:00.000Z"),
    );
    await expect(repository.findConfirmedLawmaker(candidateId!)).resolves.toMatchObject({
      id: lawmakerId,
      externalId: "220530",
    });
  });

  it("preserves follows and reviewed links when a present candidate is refreshed", async () => {
    await repository.persistSnapshot(snapshot("run-2026-01"));
    const [storedCandidate] = await testDb.select({ id: electoralCandidates.id })
      .from(electoralCandidates);
    if (!storedCandidate) throw new Error("Candidate was not persisted");
    const candidateId = storedCandidate.id;
    const { lawmakerId, userId } = await seedLawmakerAndUser();
    await repository.createPendingLawmakerLink(candidateId!, lawmakerId, "exact_name_region");
    await repository.confirmLawmakerLink(
      candidateId!,
      lawmakerId,
      "https://dadosabertos.camara.leg.br/api/v2/deputados/220530",
    );
    await testDb.insert(followedCandidates).values({ userId, candidateId: candidateId! });

    const refreshed = snapshot("run-2026-02", [candidate(primaryCandidateId, { status: "APTO ATUALIZADO" })]);
    await repository.persistSnapshot(refreshed);

    expect(await testDb.select({ candidateId: followedCandidates.candidateId }).from(followedCandidates))
      .toEqual([{ candidateId }]);
    expect(await testDb.select({
      candidateId: candidateLawmakerLinks.candidateId,
      status: candidateLawmakerLinks.status,
    }).from(candidateLawmakerLinks)).toEqual([{ candidateId, status: "confirmed" }]);
    await expect(repository.findCandidate(2026, primaryCandidateId)).resolves.toMatchObject({
      id: candidateId,
      status: "APTO ATUALIZADO",
      snapshotRunId: "run-2026-02",
    });
  });

  it("hides a disappeared candidate from the latest catalog without losing its follow or link", async () => {
    const disappearedExternalId = "260009999999";
    await repository.persistSnapshot(snapshot("run-2026-01", [
      candidate(primaryCandidateId),
      candidate(disappearedExternalId),
    ]));
    const [disappearedCandidate] = await testDb.select({ id: electoralCandidates.id })
      .from(electoralCandidates)
      .where(eq(electoralCandidates.externalId, disappearedExternalId));
    if (!disappearedCandidate) throw new Error("Disappearing candidate was not persisted");
    const disappearedId = disappearedCandidate.id;
    const { lawmakerId, userId } = await seedLawmakerAndUser();
    await repository.createPendingLawmakerLink(disappearedId!, lawmakerId, "exact_name_region");
    await repository.rejectLawmakerLink(
      disappearedId!,
      lawmakerId,
      "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
    );
    await testDb.insert(followedCandidates).values({ userId, candidateId: disappearedId! });

    await repository.persistSnapshot(snapshot("run-2026-02"));

    await expect(repository.findCandidate(2026, disappearedExternalId)).resolves.toBeNull();
    expect(await testDb.select({ id: electoralCandidates.id }).from(electoralCandidates)
      .where(eq(electoralCandidates.id, disappearedId!))).toHaveLength(1);
    expect(await testDb.select({ candidateId: followedCandidates.candidateId }).from(followedCandidates)
      .where(eq(followedCandidates.candidateId, disappearedId!))).toHaveLength(1);
    expect(await testDb.select({ status: candidateLawmakerLinks.status }).from(candidateLawmakerLinks)
      .where(and(
        eq(candidateLawmakerLinks.candidateId, disappearedId!),
        eq(candidateLawmakerLinks.lawmakerId, lawmakerId),
      ))).toEqual([{ status: "rejected" }]);
  });

  it("records a failed run separately without replacing the current public snapshot", async () => {
    await repository.persistSnapshot(snapshot("run-2026-01"));

    await repository.recordFailure({
      syncRunId: "run-2026-02",
      electionYear: 2026,
      failedAt: new Date("2026-09-05T14:00:00.000Z"),
      errorCode: "INVALID_TABULAR_SCHEMA",
      sourceUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
    });

    await expect(repository.findCandidate(2026, primaryCandidateId)).resolves.toMatchObject({
      snapshotRunId: "run-2026-01",
    });
    expect(await testDb.select({ status: electoralSyncRuns.status }).from(electoralSyncRuns)
      .where(eq(electoralSyncRuns.syncRunId, "run-2026-02"))).toEqual([{ status: "failed" }]);
  });

  it("rejects an absolute storage path before it can become public", async () => {
    await repository.persistSnapshot(snapshot("run-2026-01"));
    const invalid = snapshot("run-2026-02");
    invalid.governmentPlans[0] = {
      ...invalid.governmentPlans[0]!,
      storageKey: "/tmp/private-plan.pdf",
    };

    await expect(repository.persistSnapshot(invalid)).rejects.toThrow(/storage key/i);
    await expect(repository.findCandidate(2026, primaryCandidateId)).resolves.toMatchObject({
      snapshotRunId: "run-2026-01",
    });
  });
});
