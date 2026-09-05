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
  candidateSocialLinks,
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
const tabularResources = [
  "candidates",
  "complements",
  "assets",
  "coalitions",
  "social",
  "campaignAccounts",
] as const;
const tabularArchivePaths: Record<typeof tabularResources[number], string> = {
  candidates: "estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
  complements: "estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip",
  assets: "estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip",
  coalitions: "estatistica/sead/odsele/consulta_coligacao/consulta_coligacao_2026.zip",
  social: "estatistica/sead/odsele/consulta_cand/rede_social_candidato_2026.zip",
  campaignAccounts: "estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip",
};
const photoArchiveUrl = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_ES_div.zip";
const planArchiveUrl = "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_ES.zip";
const certificateArchiveUrl = "https://cdn.tse.jus.br/estatistica/sead/odsele/certidao_criminal/certidao_criminal_2026_ES.zip";

function resourceProvenance(
  overrides: Partial<Record<typeof tabularResources[number], Date | null>> = {},
) {
  return Object.fromEntries(tabularResources.map((resource) => {
    const timestamp = overrides[resource] === undefined
      ? new Date(sourceExtractedAt)
      : overrides[resource];
    return [resource, {
      sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths[resource]}`,
      sourceExtractedAt: timestamp,
      ...(resource === "campaignAccounts" ? {
        entryKindSourceExtractedAt: {
          campaignReceipts: timestamp,
          campaignContractedExpenses: timestamp,
          campaignPaidExpenses: timestamp,
        },
      } : {}),
    }];
  })) as Record<typeof tabularResources[number], {
    sourceArchiveUrl: string;
    sourceExtractedAt: Date | null;
    entryKindSourceExtractedAt?: {
      campaignReceipts: Date | null;
      campaignContractedExpenses: Date | null;
      campaignPaidExpenses: Date | null;
    };
  }>;
}

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
    photoSourceArchiveUrl: photoArchiveUrl,
    photoOriginalFilename: "foto.jpg",
    photoMimeType: "image/jpeg",
    photoSourceExtractedAt: null,
    photoCheckedAt: checkedAt,
    sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.candidates}`,
    sourceExtractedAt,
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
    resourceProvenance: resourceProvenance(),
    candidates,
    assets: [
      {
        ...CandidateAssetRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        sourceOrder: 1,
        category: "Apartamento",
        description: "Imóvel residencial",
        valueCents: 25_000_000n,
        }),
        sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.assets}`,
        sourceExtractedAt,
        checkedAt,
      },
      {
        ...CandidateAssetRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        sourceOrder: 2,
        category: "Veículo",
        description: null,
        valueCents: 0n,
        }),
        sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.assets}`,
        sourceExtractedAt,
        checkedAt,
      },
    ],
    campaignEntries: [
      {
        ...CampaignEntryRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        kind: "receipt",
        category: "Recursos próprios",
        valueCents: 0n,
        }),
        sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.campaignAccounts}`,
        sourceExtractedAt,
        checkedAt,
      },
    ],
    socialLinks: [
      {
        ...CandidateSocialLinkRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        label: "Site",
        url: "https://candidata.example.test/",
        }),
        sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.social}`,
        sourceExtractedAt,
        checkedAt,
      },
    ],
    governmentPlans: [{
      ...CandidateGovernmentPlanRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        officialUrl: `${planArchiveUrl}#entry=plano.pdf`,
        storageKey: "run-2026-01/governmentPlans/260001234567/plano.pdf",
        originalFilename: "plano.pdf",
        sourceExtractedAt: null,
        checkedAt,
      }),
      mimeType: "application/pdf",
      sourceArchiveUrl: planArchiveUrl,
    }],
    documents: [{
      ...CandidateDocumentRecord.parse({
        electionYear: 2026,
        candidateExternalId: primaryCandidateId,
        label: "Certidão pública",
        officialUrl: `${certificateArchiveUrl}#entry=certidao.pdf`,
        storageKey: "run-2026-01/certificates/260001234567/certidao.pdf",
        originalFilename: "certidao.pdf",
        sourceExtractedAt: null,
        checkedAt,
      }),
      mimeType: "application/pdf",
      sourceArchiveUrl: certificateArchiveUrl,
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
      sourceArchiveUrl: photoArchiveUrl,
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
      sourceArchiveUrl: planArchiveUrl,
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

  it("reports a stored run outcome with its exact candidate generation count", async () => {
    await expect(repository.findSyncRunOutcome(2026, "missing-run")).resolves.toBeNull();
    await repository.persistSnapshot(snapshot("outcome-run"));

    await expect(repository.findSyncRunOutcome(2026, "outcome-run")).resolves.toEqual({
      status: "successful",
      candidateGenerationCount: 1,
    });
  });

  it("persists an unavailable re-election declaration as null", async () => {
    const candidateSnapshot = snapshot("run-unknown-reelection", [candidate(primaryCandidateId, {
      seekingReelection: null,
    })]);

    await repository.persistSnapshot(candidateSnapshot);

    expect(await testDb.select({ seekingReelection: electoralCandidates.seekingReelection })
      .from(electoralCandidates)).toEqual([{ seekingReelection: null }]);
  });

  it("persists a negative asset adjustment from the official source", async () => {
    const candidateSnapshot = snapshot("run-negative-asset");
    candidateSnapshot.assets[0] = { ...candidateSnapshot.assets[0]!, valueCents: -38101n };

    await repository.persistSnapshot(candidateSnapshot);

    expect(await testDb.select({ valueCents: candidateAssets.valueCents }).from(candidateAssets))
      .toContainEqual({ valueCents: -38101n });
  });

  it("persists otherwise identical assets when their official order differs", async () => {
    const candidateSnapshot = snapshot("run-distinct-asset-order");
    candidateSnapshot.assets.push({
      ...candidateSnapshot.assets[0]!,
      sourceOrder: 3,
    });

    await repository.persistSnapshot(candidateSnapshot);

    expect(await testDb.select({ id: candidateAssets.id }).from(candidateAssets)).toHaveLength(3);
  });

  it("persists a child collection larger than one PostgreSQL bind-parameter budget", async () => {
    const candidateSnapshot = snapshot("run-large-asset-collection");
    candidateSnapshot.assets = Array.from({ length: 9_000 }, (_, index) => ({
      ...candidateSnapshot.assets[0]!,
      sourceOrder: index + 1,
    }));

    await repository.persistSnapshot(candidateSnapshot);

    expect(await testDb.select({ id: candidateAssets.id }).from(candidateAssets)).toHaveLength(9_000);
  }, 30_000);

  it("persists multiple certificates for one candidate when each official URL identifies its file", async () => {
    const candidateSnapshot = snapshot("run-two-certificates");
    candidateSnapshot.documents = [
      candidateSnapshot.documents[0]!,
      {
        ...candidateSnapshot.documents[0]!,
        officialUrl: `${certificateArchiveUrl}#entry=segunda-certidao.pdf`,
        storageKey: "run-two-certificates/certificates/260001234567/segunda-certidao.pdf",
        originalFilename: "segunda-certidao.pdf",
      },
    ];

    await repository.persistSnapshot(candidateSnapshot);

    expect(await testDb.select({
      officialUrl: candidateDocuments.officialUrl,
      originalFilename: candidateDocuments.originalFilename,
    }).from(candidateDocuments)).toHaveLength(2);
  });

  it("rejects noncanonical manifest archive URLs before opening publication", async () => {
    const cases = [
      ["non-https", "candidates", "http://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"],
      ["off-domain", "assets", "https://example.test/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip"],
      ["wrong-resource", "social", `https://cdn.tse.jus.br/${tabularArchivePaths.assets}`],
      ["credentials", "coalitions", "https://user:secret@cdn.tse.jus.br/estatistica/sead/odsele/consulta_coligacao/consulta_coligacao_2026.zip"],
    ] as const;

    for (const [label, resource, url] of cases) {
      const invalid = snapshot(`invalid-manifest-${label}`);
      invalid.resourceProvenance[resource] = {
        ...invalid.resourceProvenance[resource],
        sourceArchiveUrl: url,
      };
      await expect(repository.persistSnapshot(invalid))
        .rejects.toThrow(`Invalid electoral resource provenance URL: ${resource}`);
    }
  });

  it("requires every persisted tabular row archive URL to match its manifest", async () => {
    const mismatches: Array<[string, (value: ElectoralSnapshot) => void]> = [
      ["candidate", (value) => {
        value.candidates[0]!.sourceArchiveUrl = `https://cdn.tse.jus.br/${tabularArchivePaths.assets}`;
      }],
      ["asset", (value) => {
        value.assets[0]!.sourceArchiveUrl = `https://cdn.tse.jus.br/${tabularArchivePaths.social}`;
      }],
      ["social", (value) => {
        value.socialLinks[0]!.sourceArchiveUrl = `https://cdn.tse.jus.br/${tabularArchivePaths.candidates}`;
      }],
      ["campaign", (value) => {
        value.campaignEntries[0]!.sourceArchiveUrl = `https://cdn.tse.jus.br/${tabularArchivePaths.coalitions}`;
      }],
    ];

    for (const [label, mutate] of mismatches) {
      const invalid = snapshot(`mismatched-row-${label}`);
      mutate(invalid);
      await expect(repository.persistSnapshot(invalid))
        .rejects.toThrow(`${label} sourceArchiveUrl must match its resource provenance`);
    }
  });

  it("rejects unsafe media URLs while allowing official fragments for multiple certificates", async () => {
    const invalidPhoto = snapshot("unsafe-photo-source");
    invalidPhoto.candidates[0]!.photoSourceArchiveUrl = "http://cdn.tse.jus.br/photo.zip";
    await expect(repository.persistSnapshot(invalidPhoto))
      .rejects.toThrow("Invalid official TSE media URL: photo sourceArchiveUrl");

    const invalidPlan = snapshot("unsafe-plan-official");
    invalidPlan.governmentPlans[0]!.officialUrl = "https://example.test/plano.pdf";
    await expect(repository.persistSnapshot(invalidPlan))
      .rejects.toThrow("Invalid official TSE media URL: government plan officialUrl");

    const invalidDocument = snapshot("unsafe-document-source");
    invalidDocument.documents[0]!.sourceArchiveUrl = "https://example.test/certidoes.zip";
    await expect(repository.persistSnapshot(invalidDocument))
      .rejects.toThrow("Invalid official TSE media URL: document sourceArchiveUrl");
  });

  it("rejects invented media extraction timestamps", async () => {
    const cases: Array<[string, (value: ElectoralSnapshot) => void]> = [
      ["photo", (value) => {
        value.candidates[0]!.photoSourceExtractedAt = sourceExtractedAt;
      }],
      ["government plan", (value) => {
        value.governmentPlans[0]!.sourceExtractedAt = sourceExtractedAt;
      }],
      ["document", (value) => {
        value.documents[0]!.sourceExtractedAt = sourceExtractedAt;
      }],
    ];

    for (const [label, mutate] of cases) {
      const invalid = snapshot(`invented-${label.replace(" ", "-")}-timestamp`);
      mutate(invalid);
      await expect(repository.persistSnapshot(invalid))
        .rejects.toThrow(`${label} sourceExtractedAt must be null`);
    }
  });

  it("persists all six resource versions and their corresponding block provenance", async () => {
    const candidateSnapshot = snapshot("resource-provenance-run");
    candidateSnapshot.resourceProvenance = resourceProvenance({
      candidates: new Date("2026-09-05T08:00:00.000Z"),
      complements: new Date("2026-09-05T08:05:00.000Z"),
      assets: new Date("2026-09-05T08:10:00.000Z"),
      coalitions: new Date("2026-09-05T08:15:00.000Z"),
      social: new Date("2026-09-05T08:20:00.000Z"),
      campaignAccounts: new Date("2026-09-05T08:25:00.000Z"),
    });
    candidateSnapshot.extractedAt = new Date("2026-09-05T08:00:00.000Z");
    candidateSnapshot.candidates = candidateSnapshot.candidates.map((entry) => ({
      ...entry,
      sourceExtractedAt: "2026-09-05T08:00:00.000Z",
      photoSourceExtractedAt: null,
    }));
    candidateSnapshot.assets = candidateSnapshot.assets.map((entry) => ({
      ...entry,
      sourceExtractedAt: "2026-09-05T08:10:00.000Z",
    }));
    candidateSnapshot.socialLinks = candidateSnapshot.socialLinks.map((entry) => ({
      ...entry,
      sourceExtractedAt: "2026-09-05T08:20:00.000Z",
    }));
    candidateSnapshot.campaignEntries = candidateSnapshot.campaignEntries.map((entry) => ({
      ...entry,
      sourceExtractedAt: "2026-09-05T08:25:00.000Z",
    }));
    candidateSnapshot.governmentPlans = candidateSnapshot.governmentPlans.map((entry) => ({
      ...entry,
      sourceExtractedAt: null,
    }));
    candidateSnapshot.documents = candidateSnapshot.documents.map((entry) => ({
      ...entry,
      sourceExtractedAt: null,
    }));

    await repository.persistSnapshot(candidateSnapshot);

    expect(await testDb.select({
      resourceProvenance: electoralSyncRuns.resourceProvenance,
    }).from(electoralSyncRuns)).toEqual([{
      resourceProvenance: Object.fromEntries(Object.entries(candidateSnapshot.resourceProvenance)
        .map(([resource, provenance]) => [resource, {
          sourceArchiveUrl: provenance.sourceArchiveUrl,
          sourceExtractedAt: provenance.sourceExtractedAt == null
            ? null
            : new Date(provenance.sourceExtractedAt).toISOString(),
          ...(provenance.entryKindSourceExtractedAt ? {
            entryKindSourceExtractedAt: Object.fromEntries(Object.entries(provenance.entryKindSourceExtractedAt)
              .map(([kind, timestamp]) => [kind, timestamp == null ? null : new Date(timestamp).toISOString()])),
          } : {}),
        }])),
    }]);
    expect(await testDb.select({ sourceExtractedAt: electoralCandidates.sourceExtractedAt })
      .from(electoralCandidates)).toEqual([{
      sourceExtractedAt: new Date("2026-09-05T08:00:00.000Z"),
    }]);
    expect(await testDb.select({ sourceExtractedAt: candidateAssets.sourceExtractedAt })
      .from(candidateAssets)).toEqual([
      { sourceExtractedAt: new Date("2026-09-05T08:10:00.000Z") },
      { sourceExtractedAt: new Date("2026-09-05T08:10:00.000Z") },
    ]);
    expect(await testDb.select({ sourceExtractedAt: candidateCampaignTotals.sourceExtractedAt })
      .from(candidateCampaignTotals)).toEqual([{
      sourceExtractedAt: new Date("2026-09-05T08:25:00.000Z"),
    }]);
    expect(await testDb.select({ sourceExtractedAt: candidateSocialLinks.sourceExtractedAt })
      .from(candidateSocialLinks)).toEqual([{
      sourceExtractedAt: new Date("2026-09-05T08:20:00.000Z"),
    }]);
    expect(await testDb.select({ sourceExtractedAt: candidateGovernmentPlans.sourceExtractedAt })
      .from(candidateGovernmentPlans)).toEqual([{ sourceExtractedAt: null }]);
    expect(await testDb.select({ sourceExtractedAt: candidateDocuments.sourceExtractedAt })
      .from(candidateDocuments)).toEqual([{ sourceExtractedAt: null }]);
  });

  it("rejects a mixed snapshot when any independently-versioned resource regresses", async () => {
    const first = snapshot("resource-version-first");
    first.resourceProvenance = resourceProvenance({
      candidates: new Date("2026-09-05T12:00:00.000Z"),
      assets: new Date("2026-09-05T11:00:00.000Z"),
    });
    first.extractedAt = new Date("2026-09-05T12:00:00.000Z");
    first.candidates = first.candidates.map((entry) => ({
      ...entry,
      sourceExtractedAt: first.extractedAt,
    }));
    first.assets = first.assets.map((entry) => ({
      ...entry,
      sourceExtractedAt: "2026-09-05T11:00:00.000Z",
    }));
    await repository.persistSnapshot(first);

    const mixed = snapshot("resource-version-mixed");
    mixed.resourceProvenance = resourceProvenance({
      candidates: new Date("2026-09-06T12:00:00.000Z"),
      assets: new Date("2026-09-04T11:00:00.000Z"),
    });
    mixed.extractedAt = new Date("2026-09-06T12:00:00.000Z");
    mixed.candidates = mixed.candidates.map((entry) => ({
      ...entry,
      sourceExtractedAt: mixed.extractedAt,
    }));
    mixed.assets = mixed.assets.map((entry) => ({
      ...entry,
      sourceExtractedAt: "2026-09-04T11:00:00.000Z",
    }));

    await expect(repository.persistSnapshot(mixed))
      .rejects.toThrow("Cannot publish a stale electoral resource: assets");
    expect(await testDb.select({ syncRunId: electoralSyncRuns.syncRunId })
      .from(electoralSyncRuns)).toEqual([{ syncRunId: "resource-version-first" }]);
  });

  it("atomically rejects a regressed campaign subtype even when another subtype advances", async () => {
    const first = snapshot("campaign-subtype-first");
    first.resourceProvenance.campaignAccounts = {
      sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.campaignAccounts}`,
      sourceExtractedAt: new Date("2026-09-05T11:00:00.000Z"),
      entryKindSourceExtractedAt: {
        campaignReceipts: new Date("2026-09-05T11:00:00.000Z"),
        campaignContractedExpenses: new Date("2026-09-05T10:00:00.000Z"),
        campaignPaidExpenses: new Date("2026-09-05T09:00:00.000Z"),
      },
    };
    first.campaignEntries = first.campaignEntries.map((entry) => ({
      ...entry,
      sourceExtractedAt: "2026-09-05T11:00:00.000Z",
    }));
    await repository.persistSnapshot(first);

    const mixed = snapshot("campaign-subtype-mixed");
    mixed.resourceProvenance.campaignAccounts = {
      sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.campaignAccounts}`,
      sourceExtractedAt: new Date("2026-09-05T12:00:00.000Z"),
      entryKindSourceExtractedAt: {
        campaignReceipts: new Date("2026-09-05T10:59:59.000Z"),
        campaignContractedExpenses: new Date("2026-09-05T12:00:00.000Z"),
        campaignPaidExpenses: new Date("2026-09-05T09:00:00.000Z"),
      },
    };
    mixed.campaignEntries = mixed.campaignEntries.map((entry) => ({
      ...entry,
      sourceExtractedAt: "2026-09-05T10:59:59.000Z",
    }));

    await expect(repository.persistSnapshot(mixed))
      .rejects.toThrow("campaignAccounts.campaignReceipts");
    expect(await testDb.select({ syncRunId: electoralSyncRuns.syncRunId })
      .from(electoralSyncRuns)).toEqual([{ syncRunId: "campaign-subtype-first" }]);
  });

  it("uses a legacy aggregate campaign guard while the first new sync establishes subtype baselines", async () => {
    const legacyTimestamp = new Date("2026-09-05T11:00:00.000Z");
    await testDb.insert(electoralSyncRuns).values({
      syncRunId: "legacy-campaign-aggregate",
      electionYear: 2026,
      status: "successful",
      sourceUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.candidates}`,
      startedAt: legacyTimestamp,
      completedAt: legacyTimestamp,
      extractedAt: null,
      resourceProvenance: {
        campaignAccounts: {
          sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.campaignAccounts}`,
          sourceExtractedAt: legacyTimestamp.toISOString(),
        },
      },
    });
    const firstTyped = snapshot("first-typed-campaign-manifest");
    firstTyped.resourceProvenance.campaignAccounts = {
      sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.campaignAccounts}`,
      sourceExtractedAt: new Date("2026-09-05T12:00:00.000Z"),
      entryKindSourceExtractedAt: {
        campaignReceipts: new Date("2026-09-05T10:00:00.000Z"),
        campaignContractedExpenses: new Date("2026-09-05T12:00:00.000Z"),
        campaignPaidExpenses: new Date("2026-09-05T09:00:00.000Z"),
      },
    };
    firstTyped.campaignEntries = firstTyped.campaignEntries.map((entry) => ({
      ...entry,
      sourceExtractedAt: "2026-09-05T10:00:00.000Z",
    }));

    await expect(repository.persistSnapshot(firstTyped)).resolves.toBeUndefined();
    const [stored] = await testDb.select({ resourceProvenance: electoralSyncRuns.resourceProvenance })
      .from(electoralSyncRuns)
      .where(eq(electoralSyncRuns.syncRunId, firstTyped.syncRunId));
    expect(stored?.resourceProvenance.campaignAccounts?.entryKindSourceExtractedAt)
      .toEqual({
        campaignReceipts: "2026-09-05T10:00:00.000Z",
        campaignContractedExpenses: "2026-09-05T12:00:00.000Z",
        campaignPaidExpenses: "2026-09-05T09:00:00.000Z",
      });
    expect(await testDb.select({ sourceExtractedAt: candidateCampaignTotals.sourceExtractedAt })
      .from(candidateCampaignTotals)).toEqual([{
      sourceExtractedAt: new Date("2026-09-05T12:00:00.000Z"),
    }]);
  });

  it("uses a legacy successful extractedAt as the candidates-only migration baseline", async () => {
    const legacyExtractedAt = new Date("2026-09-06T12:00:00.000Z");
    await testDb.insert(electoralSyncRuns).values({
      syncRunId: "legacy-empty-manifest",
      electionYear: 2026,
      status: "successful",
      sourceUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.candidates}`,
      startedAt: legacyExtractedAt,
      completedAt: legacyExtractedAt,
      extractedAt: legacyExtractedAt,
      resourceProvenance: {},
    });
    const older = snapshot("post-migration-older-candidates");

    await expect(repository.persistSnapshot(older))
      .rejects.toThrow("Cannot publish a stale electoral resource: candidates");
  });

  it("does not invent legacy baselines for resources other than candidates", async () => {
    const legacyExtractedAt = new Date("2026-09-05T12:00:00.000Z");
    await testDb.insert(electoralSyncRuns).values({
      syncRunId: "legacy-candidates-only-baseline",
      electionYear: 2026,
      status: "successful",
      sourceUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.candidates}`,
      startedAt: legacyExtractedAt,
      completedAt: legacyExtractedAt,
      extractedAt: legacyExtractedAt,
      resourceProvenance: {},
    });
    const current = snapshot("post-migration-independent-assets");
    current.extractedAt = new Date("2026-09-06T12:00:00.000Z");
    current.resourceProvenance = resourceProvenance({
      candidates: current.extractedAt,
      assets: new Date("2026-09-01T12:00:00.000Z"),
    });
    current.candidates = current.candidates.map((entry) => ({
      ...entry,
      sourceExtractedAt: current.extractedAt,
    }));
    current.assets = current.assets.map((entry) => ({
      ...entry,
      sourceExtractedAt: "2026-09-01T12:00:00.000Z",
    }));

    await expect(repository.persistSnapshot(current)).resolves.toBeUndefined();
  });

  it("does not replace a previously known resource timestamp with an empty null version", async () => {
    const first = snapshot("known-campaign-version");
    await repository.persistSnapshot(first);

    const empty = snapshot("empty-campaign-version");
    empty.extractedAt = new Date("2026-09-06T11:30:00.000Z");
    empty.resourceProvenance = resourceProvenance({
      candidates: empty.extractedAt,
      campaignAccounts: null,
    });
    empty.candidates = empty.candidates.map((entry) => ({
      ...entry,
      sourceExtractedAt: empty.extractedAt,
    }));
    empty.campaignEntries = [];

    await expect(repository.persistSnapshot(empty))
      .rejects.toThrow("Cannot publish a stale electoral resource: campaignAccounts");
  });

  it("accepts an initially empty complete resource with null official timestamp", async () => {
    const initial = snapshot("initial-empty-campaign");
    initial.resourceProvenance = resourceProvenance({ campaignAccounts: null });
    initial.campaignEntries = [];

    await expect(repository.persistSnapshot(initial)).resolves.toBeUndefined();
    expect(await testDb.select({
      resourceProvenance: electoralSyncRuns.resourceProvenance,
    }).from(electoralSyncRuns)).toEqual([{
      resourceProvenance: expect.objectContaining({
        campaignAccounts: {
          sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.campaignAccounts}`,
          sourceExtractedAt: null,
          entryKindSourceExtractedAt: {
            campaignReceipts: null,
            campaignContractedExpenses: null,
            campaignPaidExpenses: null,
          },
        },
      }),
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
      sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.campaignAccounts}`,
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
      sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.campaignAccounts}`,
      sourceExtractedAt: "2026-09-05T09:00:00.000Z",
      checkedAt: "2026-09-05T11:00:00.000Z",
    };
    const firstAttempt = snapshot("campaign-provenance-run");
    firstAttempt.campaignEntries = [provenanceB, provenanceA];
    firstAttempt.resourceProvenance = resourceProvenance({
      campaignAccounts: new Date("2026-09-05T09:00:00.000Z"),
    });
    const reorderedRetry = snapshot("campaign-provenance-run");
    reorderedRetry.campaignEntries = [provenanceA, provenanceB];
    reorderedRetry.resourceProvenance = firstAttempt.resourceProvenance;

    await repository.persistSnapshot(firstAttempt);
    await expect(repository.persistSnapshot(reorderedRetry)).resolves.toBeUndefined();

    expect(await testDb.select({
      sourceArchiveUrl: candidateCampaignTotals.sourceArchiveUrl,
      sourceExtractedAt: candidateCampaignTotals.sourceExtractedAt,
      checkedAt: candidateCampaignTotals.checkedAt,
    }).from(candidateCampaignTotals)).toEqual([{
      sourceArchiveUrl: `https://cdn.tse.jus.br/${tabularArchivePaths.campaignAccounts}`,
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
        sourceExtractedAt: "2026-09-05T12:00:00.000Z",
      })]);
      newerSnapshot.extractedAt = new Date("2026-09-05T12:00:00.000Z");
      newerSnapshot.resourceProvenance = resourceProvenance({
        candidates: newerSnapshot.extractedAt,
      });
      const olderSnapshot = snapshot(olderRunId, [candidate(primaryCandidateId, {
        status: "SNAPSHOT ANTIGO",
        sourceExtractedAt: "2026-09-05T11:00:00.000Z",
      })]);
      olderSnapshot.extractedAt = new Date("2026-09-05T11:00:00.000Z");
      olderSnapshot.resourceProvenance = resourceProvenance({
        candidates: olderSnapshot.extractedAt,
      });
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
        reason: expect.objectContaining({
          message: "Cannot publish a stale electoral resource: candidates",
        }),
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

  it("resolves the latest media generation and public candidate/lawmaker references", async () => {
    await repository.persistSnapshot(snapshot("run-2026-01"));
    await repository.persistSnapshot(snapshot("run-2026-02"));
    const { lawmakerId } = await seedLawmakerAndUser();

    await expect(repository.findLatestSuccessfulSyncRun(2026)).resolves.toBe("run-2026-02");
    await expect(repository.findLawmaker("camara", "220530")).resolves.toMatchObject({
      id: lawmakerId,
      externalId: "220530",
    });
    await expect(repository.listLawmakersForCandidateReconciliation()).resolves.toEqual([
      expect.objectContaining({ id: lawmakerId, source: "camara", externalId: "220530" }),
    ]);

    await repository.createPendingLawmakerLinkByExternalReferences({
      electionYear: 2026,
      candidateExternalId: primaryCandidateId,
      lawmakerSource: "camara",
      lawmakerExternalId: "220530",
      method: "exact_name_region_party_office",
    });
    expect(await testDb.select({ status: candidateLawmakerLinks.status })
      .from(candidateLawmakerLinks)).toEqual([{ status: "pending" }]);
  });

  it("uses a total order to resolve successful runs with identical timestamps", async () => {
    const first = snapshot("same-time-a");
    first.extractedAt = new Date("2026-09-05T15:00:00.000Z");
    first.resourceProvenance = resourceProvenance({ candidates: first.extractedAt });
    first.candidates = first.candidates.map((entry) => ({
      ...entry,
      sourceExtractedAt: first.extractedAt,
    }));
    await repository.persistSnapshot(first);
    const second = snapshot("same-time-z", [candidate(primaryCandidateId, {
      status: "DESEMPATE DETERMINÍSTICO",
      sourceExtractedAt: "2026-09-05T15:00:00.000Z",
    })]);
    second.extractedAt = first.extractedAt;
    second.resourceProvenance = first.resourceProvenance;
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

  it("includes the six-resource provenance manifest in the immutable payload fingerprint", async () => {
    const original = snapshot("manifest-fingerprint-run");
    await repository.persistSnapshot(original);
    const changedManifest = snapshot("manifest-fingerprint-run");
    changedManifest.resourceProvenance = resourceProvenance({
      complements: new Date("2026-09-05T11:31:00.000Z"),
    });

    await expect(repository.persistSnapshot(changedManifest)).rejects.toThrow(/different payload/i);
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

  it("rejects conflicting assets with the same official candidate/order identity atomically", async () => {
    await repository.persistSnapshot(snapshot("run-2026-01"));
    const conflicting = snapshot("run-2026-02");
    conflicting.assets.push({
      ...conflicting.assets[0]!,
      category: "Conta bancária",
      description: "Conflito para a mesma ordem oficial",
      valueCents: 99n,
    });

    await expect(repository.persistSnapshot(conflicting)).rejects.toThrow(/conflicting asset/i);
    await expect(repository.findCandidate(2026, primaryCandidateId)).resolves.toMatchObject({
      snapshotRunId: "run-2026-01",
    });
  });

  it("enforces non-null official asset order uniqueness while preserving legacy null rows", async () => {
    await repository.persistSnapshot(snapshot("asset-order-index"));
    const [storedCandidate] = await testDb.select({ id: electoralCandidates.id })
      .from(electoralCandidates)
      .where(eq(electoralCandidates.externalId, primaryCandidateId));
    if (!storedCandidate) throw new Error("candidate fixture missing");
    const candidateId = storedCandidate.id;
    const base = {
      candidateId: candidateId!,
      category: "Legado",
      valueCents: 1n,
      sourceExtractedAt: new Date(sourceExtractedAt),
      checkedAt: new Date(checkedAt),
    };

    await expect(testDb.insert(candidateAssets).values([
      { ...base, sourceOrder: null },
      { ...base, sourceOrder: null },
    ])).resolves.toBeDefined();
    await testDb.insert(candidateAssets).values({
      ...base,
      sourceOrder: 1,
      category: "Conflito",
    }).then(
      () => { throw new Error("expected unique constraint violation"); },
      (error: unknown) => {
        expect((error as { cause?: { code?: string } }).cause?.code).toBe("23505");
      },
    );
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
    expect(await testDb.select({ matchMethod: candidateLawmakerLinks.matchMethod })
      .from(candidateLawmakerLinks)).toEqual([{ matchMethod: "operator_review" }]);
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
