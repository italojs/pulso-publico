import { and, eq } from "drizzle-orm";
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
import {
  migrateTestDatabase,
  testDb,
  testSql,
  truncateLegislativeTables,
} from "../../setup-database.ts";

const checkedAt = "2026-09-05T12:00:00.000Z";
const sourceExtractedAt = "2026-09-05T11:30:00.000Z";

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
