import { createHash } from "node:crypto";

import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type {
  CandidateAsset,
  CandidateDocument,
  CandidateGovernmentPlan,
  CandidateSocialLink,
  CampaignEntry,
  ElectoralCandidate,
} from "#/domain/electoral";
import {
  candidateAssets,
  candidateCampaignTotals,
  candidateDocuments,
  candidateGovernmentPlans,
  candidateLawmakerLinks,
  candidateSocialLinks,
  electoralCandidates,
  electoralSyncRuns,
  lawmakers,
} from "#/server/db/schema";
import * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;
type DateInput = Date | string;

interface ResourceProvenance {
  sourceArchiveUrl?: string | null;
  sourceExtractedAt?: DateInput | null;
  checkedAt?: DateInput;
}

export type ElectoralSnapshotCandidate = ElectoralCandidate & {
  sourceArchiveUrl?: string | null;
  photoStorageKey?: string | null;
  photoSourceArchiveUrl?: string | null;
  photoOriginalFilename?: string | null;
  photoMimeType?: string | null;
  photoSourceExtractedAt?: DateInput | null;
  photoCheckedAt?: DateInput | null;
};

export type ElectoralSnapshotAsset = CandidateAsset & ResourceProvenance;
export type ElectoralSnapshotCampaignEntry = CampaignEntry & ResourceProvenance;
export type ElectoralSnapshotSocialLink = CandidateSocialLink & ResourceProvenance;
export type ElectoralSnapshotGovernmentPlan = CandidateGovernmentPlan & ResourceProvenance & {
  mimeType?: string | null;
};
export type ElectoralSnapshotDocument = CandidateDocument & ResourceProvenance & {
  mimeType?: string | null;
};

export interface ElectoralSnapshot {
  syncRunId: string;
  electionYear: number;
  extractedAt: Date;
  sourceUrl?: string | null;
  candidates: ElectoralSnapshotCandidate[];
  assets: ElectoralSnapshotAsset[];
  campaignEntries: ElectoralSnapshotCampaignEntry[];
  socialLinks: ElectoralSnapshotSocialLink[];
  governmentPlans: ElectoralSnapshotGovernmentPlan[];
  documents: ElectoralSnapshotDocument[];
}

export interface ElectoralSyncFailure {
  syncRunId: string;
  electionYear: number;
  failedAt: Date;
  errorCode: string;
  sourceUrl?: string | null;
  startedAt?: Date;
}

export interface CandidateLawmakerLinkSuggestion {
  electionYear: number;
  candidateExternalId: string;
  lawmakerSource: "camara" | "senado";
  lawmakerExternalId: string;
  method: string;
}

interface CampaignAggregate {
  candidateExternalId: string;
  revenueCents: bigint | null;
  expenseCents: bigint | null;
  balanceCents: bigint | null;
  revenueByCategory: Record<string, string>;
  expenseByCategory: Record<string, string>;
  sourceArchiveUrl: string | null;
  sourceExtractedAt: Date;
  checkedAt: Date;
}

const validSyncRunId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const validErrorCode = /^[A-Z][A-Z0-9_]{0,63}$/;

function asDate(value: DateInput, field: string): Date {
  const result = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(result.getTime())) throw new Error(`Invalid ${field}`);
  return result;
}

function optionalDate(value: DateInput | null | undefined, field: string): Date | null {
  return value == null ? null : asDate(value, field);
}

function assertOpaqueStorageKey(value: string | null | undefined): void {
  if (value == null) return;
  const parts = value.split("/");
  if (
    value.length === 0
    || value.length > 1024
    || value.startsWith("/")
    || /^[A-Za-z]:\//.test(value)
    || value.includes("\\")
    || value.includes("\0")
    || parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error("Storage key must be an opaque normalized key");
  }
}

function assertOfficialEvidenceUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Evidence URL must be an official HTTPS URL");
  }
  const hostname = parsed.hostname.toLocaleLowerCase("en-US");
  const allowed = ["tse.jus.br", "camara.leg.br", "senado.leg.br"];
  if (
    parsed.protocol !== "https:"
    || parsed.username.length > 0
    || parsed.password.length > 0
    || !allowed.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  ) {
    throw new Error("Evidence URL must be an official HTTPS URL");
  }
}

function checkedAtFor(
  candidateByExternalId: ReadonlyMap<string, ElectoralSnapshotCandidate>,
  externalId: string,
  override?: DateInput,
): Date {
  if (override) return asDate(override, "checkedAt");
  const candidate = candidateByExternalId.get(externalId);
  if (!candidate) throw new Error(`Resource references absent candidate ${externalId}`);
  return asDate(candidate.checkedAt, "candidate checkedAt");
}

function assertSnapshot(snapshot: ElectoralSnapshot): Map<string, ElectoralSnapshotCandidate> {
  if (!validSyncRunId.test(snapshot.syncRunId)) throw new Error("Invalid sync run id");
  if (!Number.isSafeInteger(snapshot.electionYear) || snapshot.electionYear < 2026) {
    throw new Error("Invalid election year");
  }
  asDate(snapshot.extractedAt, "snapshot extractedAt");

  const candidates = new Map<string, ElectoralSnapshotCandidate>();
  for (const candidate of snapshot.candidates) {
    if (candidate.electionYear !== snapshot.electionYear) {
      throw new Error("Candidate belongs to a different election");
    }
    if (candidates.has(candidate.externalId)) {
      throw new Error(`Duplicate candidate ${candidate.externalId}`);
    }
    assertOpaqueStorageKey(candidate.photoStorageKey);
    candidates.set(candidate.externalId, candidate);
  }

  const assetKeys = new Set<string>();
  for (const asset of snapshot.assets) {
    if (asset.electionYear !== snapshot.electionYear || !candidates.has(asset.candidateExternalId)) {
      throw new Error(`Asset references absent candidate ${asset.candidateExternalId}`);
    }
    if (typeof asset.valueCents !== "bigint" || asset.valueCents < 0n) {
      throw new Error("Asset money must be a non-negative bigint");
    }
    const key = JSON.stringify([
      asset.candidateExternalId,
      asset.category,
      asset.description,
      asset.valueCents.toString(),
    ]);
    if (assetKeys.has(key)) throw new Error("Duplicate asset in electoral snapshot");
    assetKeys.add(key);
  }

  const validateResource = (resource: { electionYear: number; candidateExternalId: string }) => {
    if (
      resource.electionYear !== snapshot.electionYear
      || !candidates.has(resource.candidateExternalId)
    ) {
      throw new Error(`Resource references absent candidate ${resource.candidateExternalId}`);
    }
  };
  for (const entry of snapshot.campaignEntries) {
    validateResource(entry);
    if (typeof entry.valueCents !== "bigint" || entry.valueCents < 0n) {
      throw new Error("Campaign money must be a non-negative bigint");
    }
  }
  for (const link of snapshot.socialLinks) validateResource(link);
  for (const plan of snapshot.governmentPlans) {
    validateResource(plan);
    assertOpaqueStorageKey(plan.storageKey);
  }
  for (const document of snapshot.documents) {
    validateResource(document);
    assertOpaqueStorageKey(document.storageKey);
  }
  return candidates;
}

function categoryTotals(values: ReadonlyMap<string, bigint>): Record<string, string> {
  return Object.fromEntries(
    [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
      .map(([category, cents]) => [category, cents.toString()]),
  );
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort(compareCanonicalized);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function compareCanonicalized(left: unknown, right: unknown): number {
  return (JSON.stringify(left) ?? "").localeCompare(JSON.stringify(right) ?? "", "en-US");
}

function canonicalOrder<T>(values: readonly T[]): T[] {
  return [...values].sort((left, right) =>
    compareCanonicalized(canonicalize(left), canonicalize(right))
  );
}

function fingerprintSnapshot(snapshot: ElectoralSnapshot): string {
  const payload = Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => key !== "syncRunId"),
  );
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

async function lockTransaction(
  database: Database,
  scope: "election" | "run",
  value: number | string,
): Promise<void> {
  await database.execute(sql`
    select pg_advisory_xact_lock(hashtextextended(${`electoral-snapshot:${scope}:${value}`}, 0))
  `);
}

function aggregateCampaign(
  entries: readonly ElectoralSnapshotCampaignEntry[],
  extractedAt: Date,
  candidateByExternalId: ReadonlyMap<string, ElectoralSnapshotCandidate>,
): CampaignAggregate[] {
  const aggregates = new Map<string, {
    receiptSeen: boolean;
    expenseSeen: boolean;
    revenueCents: bigint;
    expenseCents: bigint;
    revenueByCategory: Map<string, bigint>;
    expenseByCategory: Map<string, bigint>;
    sourceArchiveUrl: string | null;
    sourceExtractedAt: Date;
    checkedAt: Date;
  }>();

  for (const entry of canonicalOrder(entries)) {
    let aggregate = aggregates.get(entry.candidateExternalId);
    if (!aggregate) {
      aggregate = {
        receiptSeen: false,
        expenseSeen: false,
        revenueCents: 0n,
        expenseCents: 0n,
        revenueByCategory: new Map(),
        expenseByCategory: new Map(),
        sourceArchiveUrl: entry.sourceArchiveUrl ?? null,
        sourceExtractedAt: optionalDate(entry.sourceExtractedAt, "campaign sourceExtractedAt") ?? extractedAt,
        checkedAt: checkedAtFor(candidateByExternalId, entry.candidateExternalId, entry.checkedAt),
      };
      aggregates.set(entry.candidateExternalId, aggregate);
    }
    if (aggregate.sourceArchiveUrl == null && entry.sourceArchiveUrl) {
      aggregate.sourceArchiveUrl = entry.sourceArchiveUrl;
    }
    const category = entry.category ?? "Não informado";
    if (entry.kind === "receipt") {
      aggregate.receiptSeen = true;
      aggregate.revenueCents += entry.valueCents;
      aggregate.revenueByCategory.set(
        category,
        (aggregate.revenueByCategory.get(category) ?? 0n) + entry.valueCents,
      );
    } else {
      aggregate.expenseSeen = true;
      aggregate.expenseCents += entry.valueCents;
      aggregate.expenseByCategory.set(
        category,
        (aggregate.expenseByCategory.get(category) ?? 0n) + entry.valueCents,
      );
    }
  }

  return [...aggregates.entries()].map(([candidateExternalId, aggregate]) => ({
    candidateExternalId,
    revenueCents: aggregate.receiptSeen ? aggregate.revenueCents : null,
    expenseCents: aggregate.expenseSeen ? aggregate.expenseCents : null,
    balanceCents: aggregate.receiptSeen && aggregate.expenseSeen
      ? aggregate.revenueCents - aggregate.expenseCents
      : null,
    revenueByCategory: categoryTotals(aggregate.revenueByCategory),
    expenseByCategory: categoryTotals(aggregate.expenseByCategory),
    sourceArchiveUrl: aggregate.sourceArchiveUrl,
    sourceExtractedAt: aggregate.sourceExtractedAt,
    checkedAt: aggregate.checkedAt,
  }));
}

export class ElectoralRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async persistSnapshot(snapshot: ElectoralSnapshot): Promise<void> {
    const candidateByExternalId = assertSnapshot(snapshot);
    const extractedAt = asDate(snapshot.extractedAt, "snapshot extractedAt");
    const payloadFingerprint = fingerprintSnapshot(snapshot);

    await this.#database.transaction(async (transaction) => {
      const tx = transaction as unknown as Database;
      await lockTransaction(tx, "election", snapshot.electionYear);
      await lockTransaction(tx, "run", snapshot.syncRunId);

      const [existingRun] = await tx.select({
        electionYear: electoralSyncRuns.electionYear,
        status: electoralSyncRuns.status,
        payloadFingerprint: electoralSyncRuns.payloadFingerprint,
      }).from(electoralSyncRuns)
        .where(eq(electoralSyncRuns.syncRunId, snapshot.syncRunId))
        .limit(1);
      if (existingRun) {
        if (existingRun.electionYear !== snapshot.electionYear) {
          throw new Error(
            `Sync run ${snapshot.syncRunId} already belongs to election ${existingRun.electionYear}`,
          );
        }
        if (
          existingRun.status === "successful"
          && existingRun.payloadFingerprint === payloadFingerprint
        ) {
          return;
        }
        if (existingRun.status === "successful") {
          throw new Error(`Sync run ${snapshot.syncRunId} has a different payload`);
        }
        throw new Error(
          `Sync run ${snapshot.syncRunId} cannot be reused after status ${existingRun.status}`,
        );
      }

      const [latestSuccessful] = await tx.select({
        syncRunId: electoralSyncRuns.syncRunId,
        extractedAt: electoralSyncRuns.extractedAt,
      }).from(electoralSyncRuns).where(and(
        eq(electoralSyncRuns.electionYear, snapshot.electionYear),
        eq(electoralSyncRuns.status, "successful"),
      )).orderBy(desc(electoralSyncRuns.publicationOrder)).limit(1);
      if (
        latestSuccessful?.extractedAt
        && latestSuccessful.syncRunId !== snapshot.syncRunId
        && latestSuccessful.extractedAt.getTime() > extractedAt.getTime()
      ) {
        throw new Error("Cannot publish a stale electoral snapshot");
      }

      const startedAt = new Date();
      await tx.insert(electoralSyncRuns).values({
        syncRunId: snapshot.syncRunId,
        electionYear: snapshot.electionYear,
        status: "running",
        payloadFingerprint,
        sourceUrl: snapshot.sourceUrl ?? null,
        startedAt,
        completedAt: null,
        extractedAt: null,
        candidateCount: snapshot.candidates.length,
        assetCount: snapshot.assets.length,
        campaignEntryCount: snapshot.campaignEntries.length,
        socialLinkCount: snapshot.socialLinks.length,
        governmentPlanCount: snapshot.governmentPlans.length,
        documentCount: snapshot.documents.length,
        errorCode: null,
      });

      const candidateIds = new Map<string, string>();
      for (const candidate of snapshot.candidates) {
        const values = {
          electionYear: candidate.electionYear,
          externalId: candidate.externalId,
          snapshotRunId: snapshot.syncRunId,
          fullName: candidate.fullName,
          ballotName: candidate.ballotName,
          socialName: candidate.socialName,
          number: candidate.number,
          office: candidate.office,
          round: candidate.round,
          region: candidate.region,
          electoralUnit: candidate.electoralUnit,
          status: candidate.status,
          statusDetail: candidate.statusDetail,
          partyAcronym: candidate.partyAcronym,
          partyNumber: candidate.partyNumber,
          partyName: candidate.partyName,
          federation: candidate.federation,
          coalition: candidate.coalition,
          seekingReelection: candidate.seekingReelection,
          birthDate: candidate.birthDate,
          ageAtInauguration: candidate.ageAtInauguration,
          gender: candidate.gender,
          race: candidate.race,
          education: candidate.education,
          occupation: candidate.occupation,
          maritalStatus: candidate.maritalStatus,
          nationality: candidate.nationality,
          birthRegion: candidate.birthRegion,
          birthCity: candidate.birthCity,
          officialUrl: candidate.officialUrl,
          sourceArchiveUrl: candidate.sourceArchiveUrl ?? null,
          sourceExtractedAt: extractedAt,
          checkedAt: asDate(candidate.checkedAt, "candidate checkedAt"),
          photoStorageKey: candidate.photoStorageKey ?? null,
          photoSourceArchiveUrl: candidate.photoSourceArchiveUrl ?? null,
          photoOriginalFilename: candidate.photoOriginalFilename ?? null,
          photoMimeType: candidate.photoMimeType ?? null,
          photoSourceExtractedAt: optionalDate(candidate.photoSourceExtractedAt, "photo sourceExtractedAt"),
          photoCheckedAt: optionalDate(candidate.photoCheckedAt, "photo checkedAt"),
        };
        const [stored] = await tx.insert(electoralCandidates).values(values).onConflictDoUpdate({
          target: [electoralCandidates.electionYear, electoralCandidates.externalId],
          set: { ...values, updatedAt: new Date() },
        }).returning({ id: electoralCandidates.id });
        if (!stored) throw new Error("Candidate upsert did not return an id");
        candidateIds.set(candidate.externalId, stored.id);
      }

      const electionCandidates = await tx.select({ id: electoralCandidates.id })
        .from(electoralCandidates)
        .where(eq(electoralCandidates.electionYear, snapshot.electionYear));
      const electionCandidateIds = electionCandidates.map(({ id }) => id);
      if (electionCandidateIds.length > 0) {
        await tx.delete(candidateAssets).where(inArray(candidateAssets.candidateId, electionCandidateIds));
        await tx.delete(candidateCampaignTotals).where(inArray(candidateCampaignTotals.candidateId, electionCandidateIds));
        await tx.delete(candidateSocialLinks).where(inArray(candidateSocialLinks.candidateId, electionCandidateIds));
        await tx.delete(candidateGovernmentPlans).where(inArray(candidateGovernmentPlans.candidateId, electionCandidateIds));
        await tx.delete(candidateDocuments).where(inArray(candidateDocuments.candidateId, electionCandidateIds));
      }

      if (snapshot.assets.length > 0) {
        await tx.insert(candidateAssets).values(snapshot.assets.map((asset) => ({
          candidateId: candidateIds.get(asset.candidateExternalId)!,
          category: asset.category,
          description: asset.description,
          valueCents: asset.valueCents,
          sourceArchiveUrl: asset.sourceArchiveUrl ?? null,
          sourceExtractedAt: optionalDate(asset.sourceExtractedAt, "asset sourceExtractedAt") ?? extractedAt,
          checkedAt: checkedAtFor(candidateByExternalId, asset.candidateExternalId, asset.checkedAt),
        })));
      }

      const campaign = aggregateCampaign(snapshot.campaignEntries, extractedAt, candidateByExternalId);
      if (campaign.length > 0) {
        await tx.insert(candidateCampaignTotals).values(campaign.map((total) => ({
          candidateId: candidateIds.get(total.candidateExternalId)!,
          revenueCents: total.revenueCents,
          expenseCents: total.expenseCents,
          balanceCents: total.balanceCents,
          revenueByCategory: total.revenueByCategory,
          expenseByCategory: total.expenseByCategory,
          sourceArchiveUrl: total.sourceArchiveUrl,
          sourceExtractedAt: total.sourceExtractedAt,
          checkedAt: total.checkedAt,
        })));
      }

      if (snapshot.socialLinks.length > 0) {
        await tx.insert(candidateSocialLinks).values(snapshot.socialLinks.map((link) => ({
          candidateId: candidateIds.get(link.candidateExternalId)!,
          label: link.label,
          url: link.url,
          sourceArchiveUrl: link.sourceArchiveUrl ?? null,
          sourceExtractedAt: optionalDate(link.sourceExtractedAt, "social sourceExtractedAt") ?? extractedAt,
          checkedAt: checkedAtFor(candidateByExternalId, link.candidateExternalId, link.checkedAt),
        })));
      }

      if (snapshot.governmentPlans.length > 0) {
        await tx.insert(candidateGovernmentPlans).values(snapshot.governmentPlans.map((plan) => ({
          candidateId: candidateIds.get(plan.candidateExternalId)!,
          officialUrl: plan.officialUrl,
          storageKey: plan.storageKey,
          sourceArchiveUrl: plan.sourceArchiveUrl ?? null,
          originalFilename: plan.originalFilename,
          mimeType: plan.mimeType ?? null,
          sourceExtractedAt: optionalDate(plan.sourceExtractedAt, "government plan sourceExtractedAt"),
          checkedAt: asDate(plan.checkedAt, "government plan checkedAt"),
        })));
      }

      if (snapshot.documents.length > 0) {
        await tx.insert(candidateDocuments).values(snapshot.documents.map((document) => ({
          candidateId: candidateIds.get(document.candidateExternalId)!,
          label: document.label,
          officialUrl: document.officialUrl,
          storageKey: document.storageKey,
          sourceArchiveUrl: document.sourceArchiveUrl ?? null,
          originalFilename: document.originalFilename,
          mimeType: document.mimeType ?? null,
          sourceExtractedAt: optionalDate(document.sourceExtractedAt, "document sourceExtractedAt"),
          checkedAt: asDate(document.checkedAt, "document checkedAt"),
        })));
      }

      const completedAt = new Date();
      await tx.update(electoralSyncRuns).set({
        status: "successful",
        completedAt,
        extractedAt,
        errorCode: null,
        updatedAt: completedAt,
      }).where(eq(electoralSyncRuns.syncRunId, snapshot.syncRunId));
    });
  }

  async recordFailure(failure: ElectoralSyncFailure): Promise<void> {
    if (!validSyncRunId.test(failure.syncRunId)) throw new Error("Invalid sync run id");
    if (!Number.isSafeInteger(failure.electionYear) || failure.electionYear < 2026) {
      throw new Error("Invalid election year");
    }
    if (!validErrorCode.test(failure.errorCode)) throw new Error("Invalid electoral failure code");
    const failedAt = asDate(failure.failedAt, "failedAt");
    await this.#database.transaction(async (transaction) => {
      const tx = transaction as unknown as Database;
      await lockTransaction(tx, "run", failure.syncRunId);
      const [existingRun] = await tx.select({
        electionYear: electoralSyncRuns.electionYear,
        status: electoralSyncRuns.status,
        errorCode: electoralSyncRuns.errorCode,
      }).from(electoralSyncRuns)
        .where(eq(electoralSyncRuns.syncRunId, failure.syncRunId))
        .limit(1);
      if (existingRun) {
        if (existingRun.electionYear !== failure.electionYear) {
          throw new Error(
            `Sync run ${failure.syncRunId} already belongs to election ${existingRun.electionYear}`,
          );
        }
        if (existingRun.status === "failed" && existingRun.errorCode === failure.errorCode) return;
        throw new Error(
          `Sync run ${failure.syncRunId} cannot be reused after status ${existingRun.status}`,
        );
      }
      await tx.insert(electoralSyncRuns).values({
        syncRunId: failure.syncRunId,
        electionYear: failure.electionYear,
        status: "failed",
        sourceUrl: failure.sourceUrl ?? null,
        startedAt: failure.startedAt ? asDate(failure.startedAt, "startedAt") : failedAt,
        completedAt: failedAt,
        errorCode: failure.errorCode,
      });
    });
  }

  async findCandidate(electionYear: number, externalId: string) {
    const latestSuccessful = this.#database.select({
      syncRunId: electoralSyncRuns.syncRunId,
    }).from(electoralSyncRuns).where(and(
      eq(electoralSyncRuns.electionYear, electionYear),
      eq(electoralSyncRuns.status, "successful"),
    )).orderBy(desc(electoralSyncRuns.publicationOrder)).limit(1)
      .as("latest_successful_electoral_run");

    const [candidate] = await this.#database.select(getTableColumns(electoralCandidates))
      .from(electoralCandidates)
      .innerJoin(
        latestSuccessful,
        eq(electoralCandidates.snapshotRunId, latestSuccessful.syncRunId),
      ).where(and(
        eq(electoralCandidates.electionYear, electionYear),
        eq(electoralCandidates.externalId, externalId),
      )).limit(1);
    return candidate ?? null;
  }

  async findLatestSuccessfulSyncRun(electionYear: number): Promise<string | null> {
    const [run] = await this.#database.select({
      syncRunId: electoralSyncRuns.syncRunId,
    }).from(electoralSyncRuns).where(and(
      eq(electoralSyncRuns.electionYear, electionYear),
      eq(electoralSyncRuns.status, "successful"),
    )).orderBy(desc(electoralSyncRuns.publicationOrder)).limit(1);
    return run?.syncRunId ?? null;
  }

  async findLawmaker(source: "camara" | "senado", externalId: string) {
    const [lawmaker] = await this.#database.select({
      id: lawmakers.id,
      source: lawmakers.source,
      externalId: lawmakers.externalId,
      name: lawmakers.name,
      electoralName: lawmakers.electoralName,
      role: lawmakers.role,
      party: lawmakers.party,
      region: lawmakers.region,
    }).from(lawmakers).where(and(
      eq(lawmakers.source, source),
      eq(lawmakers.externalId, externalId),
    )).limit(1);
    return lawmaker ?? null;
  }

  async listLawmakersForCandidateReconciliation() {
    return this.#database.select({
      id: lawmakers.id,
      source: lawmakers.source,
      externalId: lawmakers.externalId,
      name: lawmakers.name,
      electoralName: lawmakers.electoralName,
      role: lawmakers.role,
      party: lawmakers.party,
      region: lawmakers.region,
    }).from(lawmakers);
  }

  async createPendingLawmakerLinkByExternalReferences(
    suggestion: CandidateLawmakerLinkSuggestion,
  ): Promise<void> {
    const [candidate, lawmaker] = await Promise.all([
      this.findCandidate(suggestion.electionYear, suggestion.candidateExternalId),
      this.findLawmaker(suggestion.lawmakerSource, suggestion.lawmakerExternalId),
    ]);
    if (!candidate) throw new Error("Candidate does not exist in the current snapshot");
    if (!lawmaker) throw new Error("Lawmaker does not exist");
    await this.createPendingLawmakerLink(candidate.id, lawmaker.id, suggestion.method);
  }

  async createPendingLawmakerLink(
    candidateId: string,
    lawmakerId: string,
    matchMethod: string,
  ): Promise<void> {
    if (matchMethod.trim().length === 0) throw new Error("Link match method is required");
    await this.#database.insert(candidateLawmakerLinks).values({
      candidateId,
      lawmakerId,
      status: "pending",
      matchMethod,
    }).onConflictDoUpdate({
      target: [candidateLawmakerLinks.candidateId, candidateLawmakerLinks.lawmakerId],
      set: { matchMethod, updatedAt: new Date() },
      setWhere: eq(candidateLawmakerLinks.status, "pending"),
    });
  }

  async confirmLawmakerLink(
    candidateId: string,
    lawmakerId: string,
    evidenceUrl: string,
    reviewedAt = new Date(),
  ): Promise<void> {
    await this.#reviewLawmakerLink(candidateId, lawmakerId, "confirmed", evidenceUrl, reviewedAt);
  }

  async rejectLawmakerLink(
    candidateId: string,
    lawmakerId: string,
    evidenceUrl: string,
    reviewedAt = new Date(),
  ): Promise<void> {
    await this.#reviewLawmakerLink(candidateId, lawmakerId, "rejected", evidenceUrl, reviewedAt);
  }

  async #reviewLawmakerLink(
    candidateId: string,
    lawmakerId: string,
    status: "confirmed" | "rejected",
    evidenceUrl: string,
    reviewedAt: Date,
  ): Promise<void> {
    assertOfficialEvidenceUrl(evidenceUrl);
    const [updated] = await this.#database.update(candidateLawmakerLinks).set({
      status,
      matchMethod: "operator_review",
      evidenceUrl,
      reviewedAt: asDate(reviewedAt, "reviewedAt"),
      updatedAt: new Date(),
    }).where(and(
      eq(candidateLawmakerLinks.candidateId, candidateId),
      eq(candidateLawmakerLinks.lawmakerId, lawmakerId),
    )).returning({ id: candidateLawmakerLinks.id });
    if (!updated) throw new Error("Candidate-lawmaker link does not exist");
  }

  async findConfirmedLawmaker(candidateId: string) {
    const [lawmaker] = await this.#database.select({
      id: lawmakers.id,
      source: lawmakers.source,
      externalId: lawmakers.externalId,
      name: lawmakers.name,
      electoralName: lawmakers.electoralName,
      role: lawmakers.role,
      party: lawmakers.party,
      region: lawmakers.region,
      photoUrl: lawmakers.photoUrl,
      active: lawmakers.active,
      officialUrl: lawmakers.officialUrl,
      checkedAt: lawmakers.checkedAt,
    }).from(candidateLawmakerLinks).innerJoin(
      lawmakers,
      eq(candidateLawmakerLinks.lawmakerId, lawmakers.id),
    ).where(and(
      eq(candidateLawmakerLinks.candidateId, candidateId),
      eq(candidateLawmakerLinks.status, "confirmed"),
    )).limit(1);
    return lawmaker ?? null;
  }
}
