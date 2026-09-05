import { randomUUID } from "node:crypto";

import type {
  TseMediaEntry,
  TseRegion,
  TseRegionalMediaKind,
  TseResourceName,
  TseRow,
} from "#/integrations/tse/client";
import { TSE_REGIONS } from "#/integrations/tse/client";
import {
  mapAssetRow,
  mapCampaignExpenseRow,
  mapCampaignReceiptRow,
  mapCandidateRow,
  mapSocialRow,
  moneyToCents,
  TseContractError,
} from "#/integrations/tse/mapper";
import {
  reconcileCandidateLawmakers,
  type ReconciliationLawmaker,
} from "#/jobs/reconcile-candidate-lawmakers";
import type {
  CandidateLawmakerLinkSuggestion,
  ElectoralSnapshot,
} from "#/server/electoral/repository";

type RowEntry = {
  row: TseRow;
  entryKind: string;
  sourceArchiveUrl: string;
};

interface ElectionClient {
  streamRowEntries(resource: TseResourceName, signal?: AbortSignal): AsyncIterable<RowEntry>;
  streamRegionalMedia(
    kind: TseRegionalMediaKind,
    region: TseRegion,
    signal?: AbortSignal,
  ): AsyncIterable<TseMediaEntry>;
  resourceUrl(resource: TseResourceName): string;
}

interface ElectionMediaStore {
  prepare(runId: string): Promise<void>;
  stage(runId: string, entry: TseMediaEntry): Promise<string>;
  publish(runId: string): Promise<void>;
  discard(runId: string): Promise<void>;
  removePublished(runId: string): Promise<void>;
}

interface ElectionRepository {
  findLatestSuccessfulSyncRun(electionYear: number): Promise<string | null>;
  persistSnapshot(snapshot: ElectoralSnapshot): Promise<void>;
  recordFailure(failure: {
    syncRunId: string;
    electionYear: number;
    failedAt: Date;
    errorCode: string;
    sourceUrl?: string | null;
    startedAt?: Date;
  }): Promise<void>;
  listLawmakersForCandidateReconciliation(): Promise<ReconciliationLawmaker[]>;
  createPendingLawmakerLinkByExternalReferences(
    suggestion: CandidateLawmakerLinkSuggestion,
  ): Promise<void>;
}

type LockResult<T> = { acquired: false } | { acquired: true; value: T };
export type ElectoralSyncLock = <T>(
  name: string,
  operation: () => Promise<T>,
) => Promise<LockResult<T>>;

export interface SyncElectionOptions {
  electionYear: number;
  now: () => Date;
  withLock: ElectoralSyncLock;
}

const mediaKinds = [
  "photos",
  "governmentPlans",
  "certificates",
] as const satisfies readonly TseRegionalMediaKind[];

const complementAllowlist = [
  "NM_SOCIAL_CANDIDATO",
  "ST_REELEICAO",
  "DT_NASCIMENTO",
  "NR_IDADE_DATA_POSSE",
  "DS_GENERO",
  "DS_COR_RACA",
  "DS_GRAU_INSTRUCAO",
  "DS_OCUPACAO",
  "DS_ESTADO_CIVIL",
  "DS_NACIONALIDADE",
  "SG_UF_NASCIMENTO",
  "NM_MUNICIPIO_NASCIMENTO",
] as const;

const candidateRowAllowlist = [
  "ANO_ELEICAO",
  "AA_ELEICAO",
  "SQ_CANDIDATO",
  "NM_CANDIDATO",
  "NM_URNA_CANDIDATO",
  "NR_CANDIDATO",
  "NR_TURNO",
  "DS_CARGO",
  "SG_UF",
  "SG_UE",
  "NM_UE",
  "SG_REGIAO",
  "CD_ELEICAO",
  "SG_PARTIDO",
  "NR_PARTIDO",
  "NM_PARTIDO",
  "DS_SITUACAO_CANDIDATURA",
  "DS_DETALHE_SITUACAO_CAND",
  "NM_FEDERACAO",
  "NM_COLIGACAO",
  ...complementAllowlist,
] as const;

const coalitionRowAllowlist = [
  "ANO_ELEICAO",
  "AA_ELEICAO",
  "NR_TURNO",
  "SG_UF",
  "SG_UE",
  "DS_CARGO",
  "SG_PARTIDO",
  "NM_COLIGACAO",
  "NM_FEDERACAO",
] as const;

export interface ElectionSyncReport {
  failed: boolean;
  errorCode?: string;
  electionYear: number;
  syncRunId: string | null;
  candidates: number;
  startedAt: string;
  finishedAt: string;
  resources: Record<
    | "candidates"
    | "complements"
    | "assets"
    | "coalitions"
    | "social"
    | "campaignReceipts"
    | "campaignContractedExpenses"
    | "campaignPaidExpenses"
    | "photos"
    | "governmentPlans"
    | "certificates",
    number
  >;
  warnings?: string[];
}

function emptyResourceCounts(): ElectionSyncReport["resources"] {
  return {
    candidates: 0,
    complements: 0,
    assets: 0,
    coalitions: 0,
    social: 0,
    campaignReceipts: 0,
    campaignContractedExpenses: 0,
    campaignPaidExpenses: 0,
    photos: 0,
    governmentPlans: 0,
    certificates: 0,
  };
}

function stableErrorCode(error: unknown): string {
  if (
    error instanceof TseContractError
    && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
  ) return error.code;
  return "ELECTORAL_SYNC_FAILED";
}

function fail(code: string): never {
  throw new TseContractError(code);
}

function value(row: TseRow, key: string): string | null {
  const normalized = row[key]?.trim();
  return normalized ? normalized : null;
}

function pickPublicRow(row: TseRow, columns: readonly string[]): TseRow {
  const picked: TseRow = {};
  for (const column of columns) {
    const selected = row[column];
    if (selected !== undefined) picked[column] = selected;
  }
  return picked;
}

function electionYear(row: TseRow): number {
  const raw = value(row, "ANO_ELEICAO") ?? value(row, "AA_ELEICAO");
  if (!raw || !/^\d{4}$/.test(raw)) return fail("INVALID_ELECTION_YEAR");
  return Number(raw);
}

function assertRowYear(row: TseRow, expected: number): void {
  if (electionYear(row) !== expected) fail("UNEXPECTED_ELECTION_YEAR");
}

function candidateExternalId(row: TseRow): string {
  const externalId = value(row, "SQ_CANDIDATO");
  if (!externalId) return fail("MISSING_CANDIDATE_ID");
  return externalId;
}

function normalizeKey(valueToNormalize: string | null): string {
  return (valueToNormalize ?? "")
    .normalize("NFD")
    .replace(/\p{Mark}+/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");
}

function coalitionKey(row: TseRow): string {
  return [
    electionYear(row),
    value(row, "NR_TURNO") ?? "1",
    normalizeKey(value(row, "SG_UE") ?? value(row, "SG_UF")),
    normalizeKey(value(row, "DS_CARGO")),
    normalizeKey(value(row, "SG_PARTIDO")),
  ].join("|");
}

function mergeComplements(
  candidates: Map<string, { row: TseRow; sourceArchiveUrl: string }>,
  complements: readonly RowEntry[],
  expectedYear: number,
): void {
  const mergedByCandidate = new Map<string, TseRow>();
  for (const { row } of complements) {
    assertRowYear(row, expectedYear);
    const externalId = candidateExternalId(row);
    if (!candidates.has(externalId)) fail("ORPHAN_CANDIDATE_COMPLEMENT");
    const merged = mergedByCandidate.get(externalId) ?? {};
    for (const column of complementAllowlist) {
      const next = value(row, column);
      if (!next) continue;
      const prior = value(merged, column);
      if (prior && prior !== next) fail("CONFLICTING_CANDIDATE_COMPLEMENT");
      merged[column] = next;
    }
    mergedByCandidate.set(externalId, merged);
  }
  for (const [externalId, fields] of mergedByCandidate) {
    const candidate = candidates.get(externalId)!;
    candidate.row = { ...candidate.row, ...fields };
  }
}

function mergeCoalitions(
  candidates: Map<string, { row: TseRow; sourceArchiveUrl: string }>,
  coalitions: readonly RowEntry[],
  expectedYear: number,
): void {
  const coalitionByKey = new Map<string, { coalition: string | null; federation: string | null }>();
  for (const { row } of coalitions) {
    assertRowYear(row, expectedYear);
    const key = coalitionKey(row);
    const next = {
      coalition: value(row, "NM_COLIGACAO"),
      federation: value(row, "NM_FEDERACAO"),
    };
    const prior = coalitionByKey.get(key);
    if (
      prior
      && (normalizeKey(prior.coalition) !== normalizeKey(next.coalition)
        || normalizeKey(prior.federation) !== normalizeKey(next.federation))
    ) {
      fail("CONFLICTING_COALITION_MATCH");
    }
    coalitionByKey.set(key, next);
  }
  for (const candidate of candidates.values()) {
    const coalition = coalitionByKey.get(coalitionKey(candidate.row));
    if (!coalition) continue;
    candidate.row = {
      ...candidate.row,
      ...(coalition.coalition ? { NM_COLIGACAO: coalition.coalition } : {}),
      ...(coalition.federation ? { NM_FEDERACAO: coalition.federation } : {}),
    };
  }
}

function fundingKind(row: TseRow): string {
  const description = normalizeKey([
    value(row, "DS_ORIGEM_RECEITA"),
    value(row, "DS_FONTE_RECEITA"),
    value(row, "DS_RECEITA"),
    value(row, "DS_ESPECIE_RECURSO"),
    value(row, "DS_NATUREZA_RECURSO"),
  ].filter((item): item is string => item !== null).join(" "));
  if (!description) return "Não informado";
  if (
    description.includes("FUNDO PARTIDARIO")
    || description.includes("FUNDO ESPECIAL")
    || description.includes("FEFC")
  ) return "Recursos públicos";
  if (description.includes("RECURSOS PROPRIOS")) return "Recursos próprios";
  return "Recursos privados";
}

function sourceExtractedAt(row: TseRow, fallback: Date): Date {
  const date = value(row, "DT_GERACAO");
  if (!date) return fallback;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!match) return fail("INVALID_SOURCE_EXTRACTED_AT");
  const time = value(row, "HH_GERACAO") ?? "00:00:00";
  if (!/^\d{2}:\d{2}:\d{2}$/.test(time)) return fail("INVALID_SOURCE_EXTRACTED_AT");
  const parsed = new Date(`${match[3]}-${match[2]}-${match[1]}T${time}-03:00`);
  if (Number.isNaN(parsed.getTime())) return fail("INVALID_SOURCE_EXTRACTED_AT");
  return parsed;
}

function assertEntryKind(resource: TseResourceName, entryKind: string): void {
  if (resource === "campaignAccounts") {
    if (![
      "campaignReceipts",
      "campaignContractedExpenses",
      "campaignPaidExpenses",
    ].includes(entryKind)) fail("UNEXPECTED_TABULAR_ENTRY_KIND");
  } else if (resource !== entryKind) {
    fail("UNEXPECTED_TABULAR_ENTRY_KIND");
  }
}

async function consumeResource(
  client: ElectionClient,
  resource: TseResourceName,
  resources: ElectionSyncReport["resources"],
  consume: (entry: RowEntry) => void,
): Promise<void> {
  for await (const entry of client.streamRowEntries(resource)) {
    assertEntryKind(resource, entry.entryKind);
    if (resource === "campaignAccounts") {
      resources[entry.entryKind as "campaignReceipts"] += 1;
    } else {
      resources[resource] += 1;
    }
    consume(entry);
  }
}

async function performSync(
  client: ElectionClient,
  mediaStore: ElectionMediaStore,
  repository: ElectionRepository,
  options: SyncElectionOptions,
  startedAt: Date,
): Promise<ElectionSyncReport> {
  const resources = emptyResourceCounts();
  const runId = `election-${options.electionYear}-${startedAt.toISOString().replace(/\D/g, "")}-${randomUUID()}`;
  let previousRunId: string | null = null;
  let persisted = false;

  try {
    previousRunId = await repository.findLatestSuccessfulSyncRun(options.electionYear);
    await mediaStore.prepare(runId);
    const rawCandidates = new Map<string, { row: TseRow; sourceArchiveUrl: string }>();
    await consumeResource(client, "candidates", resources, (entry) => {
      assertRowYear(entry.row, options.electionYear);
      const externalId = candidateExternalId(entry.row);
      if (rawCandidates.has(externalId)) fail("DUPLICATE_CANDIDATE");
      rawCandidates.set(externalId, {
        row: pickPublicRow(entry.row, candidateRowAllowlist),
        sourceArchiveUrl: entry.sourceArchiveUrl,
      });
    });
    if (rawCandidates.size === 0) fail("EMPTY_CANDIDATE_RESOURCE");
    const complements: RowEntry[] = [];
    await consumeResource(client, "complements", resources, (entry) => {
      complements.push({
        ...entry,
        row: pickPublicRow(entry.row, [
          "ANO_ELEICAO", "AA_ELEICAO", "SQ_CANDIDATO", ...complementAllowlist,
        ]),
      });
    });
    mergeComplements(rawCandidates, complements, options.electionYear);
    const coalitions: RowEntry[] = [];
    await consumeResource(client, "coalitions", resources, (entry) => {
      coalitions.push({ ...entry, row: pickPublicRow(entry.row, coalitionRowAllowlist) });
    });
    mergeCoalitions(rawCandidates, coalitions, options.electionYear);

    const candidates: ElectoralSnapshot["candidates"] = [...rawCandidates.values()].map(({ row, sourceArchiveUrl }) => ({
      ...mapCandidateRow(row, startedAt),
      sourceArchiveUrl,
      photoStorageKey: null,
      photoSourceArchiveUrl: null,
      photoOriginalFilename: null,
      photoMimeType: null,
      photoSourceExtractedAt: null,
      photoCheckedAt: null,
    }));
    const candidateByExternalId = new Map(candidates.map((candidate) => [candidate.externalId, candidate]));

    const assets: ElectoralSnapshot["assets"] = [];
    await consumeResource(client, "assets", resources, (entry) => {
      assertRowYear(entry.row, options.electionYear);
      const mapped = mapAssetRow(entry.row);
      assets.push({
        ...mapped,
        sourceArchiveUrl: entry.sourceArchiveUrl,
        sourceExtractedAt: sourceExtractedAt(entry.row, startedAt),
        checkedAt: startedAt,
      });
    });
    const socialLinks: ElectoralSnapshot["socialLinks"] = [];
    await consumeResource(client, "social", resources, (entry) => {
      assertRowYear(entry.row, options.electionYear);
      const mapped = mapSocialRow(entry.row);
      if (mapped) socialLinks.push({
        ...mapped,
        sourceArchiveUrl: entry.sourceArchiveUrl,
        sourceExtractedAt: sourceExtractedAt(entry.row, startedAt),
        checkedAt: startedAt,
      });
    });
    const campaignByCandidateKindCategory = new Map<string, ElectoralSnapshot["campaignEntries"][number]>();
    const aggregateCampaignEntry = (
      entry: ElectoralSnapshot["campaignEntries"][number],
    ) => {
      const key = JSON.stringify([entry.candidateExternalId, entry.kind, entry.category]);
      const prior = campaignByCandidateKindCategory.get(key);
      if (prior) {
        prior.valueCents += entry.valueCents;
      } else {
        campaignByCandidateKindCategory.set(key, entry);
      }
    };
    await consumeResource(client, "campaignAccounts", resources, (entry) => {
      assertRowYear(entry.row, options.electionYear);
      const externalId = candidateExternalId(entry.row);
      if (!candidateByExternalId.has(externalId)) fail("ORPHAN_CAMPAIGN_ENTRY");
      const provenance = {
        sourceArchiveUrl: entry.sourceArchiveUrl,
        sourceExtractedAt: sourceExtractedAt(entry.row, startedAt),
        checkedAt: startedAt,
      };
      if (entry.entryKind === "campaignReceipts") {
        aggregateCampaignEntry({
          ...mapCampaignReceiptRow(entry.row),
          category: fundingKind(entry.row),
          ...provenance,
        });
      } else if (entry.entryKind === "campaignContractedExpenses") {
        aggregateCampaignEntry({ ...mapCampaignExpenseRow(entry.row), ...provenance });
      } else {
        moneyToCents(value(entry.row, "VR_PAGTO") ?? fail("MISSING_CAMPAIGN_VALUE"));
      }
    });
    const campaignEntries = [...campaignByCandidateKindCategory.values()];

    const governmentPlans: ElectoralSnapshot["governmentPlans"] = [];
    const documents: ElectoralSnapshot["documents"] = [];
    for (const kind of mediaKinds) {
      for (const region of TSE_REGIONS) {
        for await (const entry of client.streamRegionalMedia(kind, region)) {
          const candidate = candidateByExternalId.get(entry.candidateExternalId);
          if (!candidate) fail("ORPHAN_MEDIA_ENTRY");
          const storageKey = await mediaStore.stage(runId, entry);
          resources[kind] += 1;
          if (kind === "photos") {
            if (candidate.photoStorageKey) fail("DUPLICATE_CANDIDATE_PHOTO");
            candidate.photoStorageKey = storageKey;
            candidate.photoSourceArchiveUrl = entry.sourceArchiveUrl;
            candidate.photoOriginalFilename = entry.originalFilename;
            candidate.photoMimeType = entry.mimeType;
            candidate.photoSourceExtractedAt = startedAt;
            candidate.photoCheckedAt = startedAt;
          } else if (kind === "governmentPlans") {
            governmentPlans.push({
              electionYear: options.electionYear,
              candidateExternalId: entry.candidateExternalId,
              officialUrl: entry.sourceArchiveUrl,
              storageKey,
              originalFilename: entry.originalFilename,
              mimeType: entry.mimeType,
              sourceArchiveUrl: entry.sourceArchiveUrl,
              sourceExtractedAt: startedAt.toISOString(),
              checkedAt: startedAt.toISOString(),
            });
          } else {
            documents.push({
              electionYear: options.electionYear,
              candidateExternalId: entry.candidateExternalId,
              label: "Certidão criminal publicada pelo TSE",
              officialUrl: entry.sourceArchiveUrl,
              storageKey,
              originalFilename: entry.originalFilename,
              mimeType: entry.mimeType,
              sourceArchiveUrl: entry.sourceArchiveUrl,
              sourceExtractedAt: startedAt.toISOString(),
              checkedAt: startedAt.toISOString(),
            });
          }
        }
      }
    }

    const snapshot: ElectoralSnapshot = {
      syncRunId: runId,
      electionYear: options.electionYear,
      extractedAt: startedAt,
      sourceUrl: client.resourceUrl("candidates"),
      candidates,
      assets,
      campaignEntries,
      socialLinks,
      governmentPlans,
      documents,
    };
    await mediaStore.publish(runId);
    await repository.persistSnapshot(snapshot);
    persisted = true;

    const warnings: string[] = [];
    try {
      const lawmakers = await repository.listLawmakersForCandidateReconciliation();
      const suggestions = reconcileCandidateLawmakers(candidates, lawmakers);
      for (const suggestion of suggestions) {
        await repository.createPendingLawmakerLinkByExternalReferences({
          electionYear: options.electionYear,
          candidateExternalId: suggestion.candidateExternalId,
          lawmakerSource: suggestion.lawmakerSource,
          lawmakerExternalId: suggestion.lawmakerExternalId,
          method: suggestion.method,
          status: suggestion.status,
        } as CandidateLawmakerLinkSuggestion & { status: "pending" });
      }
    } catch {
      warnings.push("LAWMAKER_RECONCILIATION_FAILED");
    }
    if (previousRunId && previousRunId !== runId) {
      try {
        await mediaStore.removePublished(previousRunId);
      } catch {
        warnings.push("PREVIOUS_MEDIA_CLEANUP_FAILED");
      }
    }
    const finishedAt = options.now();
    return {
      failed: false,
      electionYear: options.electionYear,
      syncRunId: runId,
      candidates: candidates.length,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      resources,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (error) {
    const errorCode = stableErrorCode(error);
    if (!persisted) {
      await mediaStore.discard(runId).catch(() => undefined);
      const failedAt = options.now();
      await repository.recordFailure({
        syncRunId: runId,
        electionYear: options.electionYear,
        failedAt,
        errorCode,
        sourceUrl: client.resourceUrl("candidates"),
        startedAt,
      }).catch(() => undefined);
      return {
        failed: true,
        errorCode,
        electionYear: options.electionYear,
        syncRunId: runId,
        candidates: 0,
        startedAt: startedAt.toISOString(),
        finishedAt: failedAt.toISOString(),
        resources,
      };
    }
    throw error;
  }
}

export async function syncElection(
  client: ElectionClient,
  mediaStore: ElectionMediaStore,
  repository: ElectionRepository,
  options: SyncElectionOptions,
): Promise<ElectionSyncReport> {
  const startedAt = options.now();
  if (options.electionYear !== 2026) {
    return {
      failed: true,
      errorCode: "UNSUPPORTED_ELECTION_YEAR",
      electionYear: options.electionYear,
      syncRunId: null,
      candidates: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      resources: emptyResourceCounts(),
    };
  }
  let execution: LockResult<ElectionSyncReport>;
  try {
    execution = await options.withLock(
      "electoral-sync-2026",
      () => performSync(client, mediaStore, repository, options, startedAt),
    );
  } catch {
    const finishedAt = options.now();
    return {
      failed: true,
      errorCode: "SYNC_LOCK_FAILED",
      electionYear: options.electionYear,
      syncRunId: null,
      candidates: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      resources: emptyResourceCounts(),
    };
  }
  if (execution.acquired) return execution.value;
  const finishedAt = options.now();
  return {
    failed: true,
    errorCode: "SYNC_ALREADY_RUNNING",
    electionYear: options.electionYear,
    syncRunId: null,
    candidates: 0,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    resources: emptyResourceCounts(),
  };
}
