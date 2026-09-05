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
  TSE_CAMPAIGN_ENTRY_KINDS,
  type TseCampaignEntryKind,
} from "#/domain/tse-source";
import {
  mapAssetRow,
  mapCampaignExpenseRow,
  mapCampaignReceiptRow,
  mapCandidateRow,
  mapSocialRow,
  moneyToCents,
  normalizeTseOptionalValue,
  parseTseGenerationInstant,
  TseContractError,
} from "#/integrations/tse/mapper";
import {
  reconcileCandidateLawmakers,
  type ReconciliationLawmaker,
} from "#/jobs/reconcile-candidate-lawmakers";
import type {
  CandidateLawmakerLinkSuggestion,
  ElectoralSnapshot,
  ElectoralTabularResourceProvenance,
} from "#/server/electoral/repository";

type RowEntry = {
  row: TseRow;
  entryKind: string;
  sourceArchiveUrl: string;
  sourceExtractedAt: Date | null;
};

type ResourceStreamEvent = ({ type: "row" } & RowEntry) | {
  type: "manifest";
  resource: TseResourceName;
  entryKinds: readonly string[];
  sourceArchiveUrl: string;
  sourceExtractedAt: Date | null;
  entryKindSourceExtractedAt?: Readonly<Record<TseCampaignEntryKind, Date | null>>;
};

interface ElectionClient {
  streamResource(
    resource: TseResourceName,
    signal?: AbortSignal,
  ): AsyncIterable<ResourceStreamEvent>;
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
  findSyncRunOutcome(electionYear: number, syncRunId: string): Promise<{
    status: "running" | "successful" | "failed";
    candidateGenerationCount: number;
  } | null>;
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

const tabularResourceNames = [
  "candidates",
  "complements",
  "assets",
  "coalitions",
  "social",
  "campaignAccounts",
] as const satisfies readonly TseResourceName[];

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
  "SQ_COLIGACAO",
  "CD_SITUACAO_CANDIDATURA",
  "DS_SITUACAO_CANDIDATURA",
  "DS_DETALHE_SITUACAO_CAND",
  "NM_FEDERACAO",
  "NM_COLIGACAO",
  "DT_GERACAO",
  "HH_GERACAO",
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
  "SQ_COLIGACAO",
  "NM_COLIGACAO",
  "NM_FEDERACAO",
  "DT_GERACAO",
  "HH_GERACAO",
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
  return normalizeTseOptionalValue(row[key]);
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
    normalizeKey(value(row, "SQ_COLIGACAO")),
  ].join("|");
}

function mergeComplement(
  candidates: Map<string, { row: TseRow; sourceArchiveUrl: string }>,
  row: TseRow,
  expectedYear: number,
): void {
  assertRowYear(row, expectedYear);
  const externalId = candidateExternalId(row);
  const candidate = candidates.get(externalId);
  if (!candidate) fail("ORPHAN_CANDIDATE_COMPLEMENT");
  for (const column of complementAllowlist) {
    const next = value(row, column);
    if (!next) continue;
    const prior = value(candidate.row, column);
    if (prior && normalizeKey(prior) !== normalizeKey(next)) {
      fail("CONFLICTING_CANDIDATE_COMPLEMENT");
    }
    candidate.row[column] = next;
  }
}

type CoalitionEnrichment = { coalition: string | null; federation: string | null };

function collectCoalition(
  coalitionByKey: Map<string, CoalitionEnrichment>,
  row: TseRow,
  expectedYear: number,
): void {
  assertRowYear(row, expectedYear);
  const key = coalitionKey(row);
  const next: CoalitionEnrichment = {
    coalition: value(row, "NM_COLIGACAO"),
    federation: value(row, "NM_FEDERACAO"),
  };
  const prior = coalitionByKey.get(key);
  for (const field of ["coalition", "federation"] as const) {
    if (
      prior?.[field]
      && next[field]
      && normalizeKey(prior[field]) !== normalizeKey(next[field])
    ) {
      fail("CONFLICTING_COALITION_MATCH");
    }
  }
  coalitionByKey.set(key, {
    coalition: prior?.coalition ?? next.coalition,
    federation: prior?.federation ?? next.federation,
  });
}

function applyCoalitions(
  candidates: Map<string, { row: TseRow; sourceArchiveUrl: string }>,
  coalitionByKey: ReadonlyMap<string, CoalitionEnrichment>,
): void {
  for (const candidate of candidates.values()) {
    const coalition = coalitionByKey.get(coalitionKey(candidate.row));
    if (!coalition) continue;
    for (const [candidateColumn, enrichmentField] of [
      ["NM_COLIGACAO", "coalition"],
      ["NM_FEDERACAO", "federation"],
    ] as const) {
      const declared = value(candidate.row, candidateColumn);
      const enriched = coalition[enrichmentField];
      if (declared && enriched && normalizeKey(declared) !== normalizeKey(enriched)) {
        fail("CONFLICTING_COALITION_ENRICHMENT");
      }
    }
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
  if (
    description.includes("PESSOAS FISICAS")
    || description.includes("FINANCIAMENTO COLETIVO")
    || description.includes("COMERCIALIZACAO DE BENS")
    || description.includes("DOACAO")
    || description.includes("DOACOES")
    || description.includes("EVENTOS")
    || description.includes("RENDIMENTOS DE APLICACOES")
  ) return "Recursos privados";
  return "Não informado";
}

class OfficialSourceMetadata {
  readonly #byResource = new Map<TseResourceName, {
    sourceArchiveUrl: string;
    sourceExtractedAt: Date | null;
    entryKindSourceExtractedAt?: Record<TseCampaignEntryKind, Date | null>;
    completed: boolean;
  }>();

  observe(
    resource: TseResourceName,
    entryKind: string,
    row: TseRow,
    sourceArchiveUrl: string,
    reportedExtractedAt: Date | null,
  ): Date {
    const extractedAt = parseTseGenerationInstant(row);
    const prior = this.#byResource.get(resource);
    if (
      !reportedExtractedAt
      || reportedExtractedAt.getTime() !== extractedAt.getTime()
    ) fail("INCONSISTENT_SOURCE_METADATA");
    if (
      prior
      && (prior.sourceArchiveUrl !== sourceArchiveUrl
        || (resource !== "campaignAccounts"
          && prior.sourceExtractedAt?.getTime() !== extractedAt.getTime()))
    ) {
      fail("INCONSISTENT_SOURCE_METADATA");
    }
    const entryKindSourceExtractedAt = resource === "campaignAccounts"
      ? prior?.entryKindSourceExtractedAt ?? Object.fromEntries(
        TSE_CAMPAIGN_ENTRY_KINDS.map((kind) => [kind, null]),
      ) as Record<TseCampaignEntryKind, Date | null>
      : undefined;
    if (resource === "campaignAccounts") {
      const campaignKind = entryKind as TseCampaignEntryKind;
      const previousSubtype = entryKindSourceExtractedAt![campaignKind];
      if (previousSubtype && previousSubtype.getTime() !== extractedAt.getTime()) {
        fail("INCONSISTENT_SOURCE_METADATA");
      }
      entryKindSourceExtractedAt![campaignKind] = extractedAt;
    }
    this.#byResource.set(resource, {
      sourceArchiveUrl,
      sourceExtractedAt: prior?.sourceExtractedAt && prior.sourceExtractedAt > extractedAt
        ? prior.sourceExtractedAt
        : extractedAt,
      ...(entryKindSourceExtractedAt ? { entryKindSourceExtractedAt } : {}),
      completed: false,
    });
    return extractedAt;
  }

  complete(resource: TseResourceName, manifest: {
    sourceArchiveUrl: string;
    sourceExtractedAt: Date | null;
    entryKindSourceExtractedAt?: Readonly<Record<TseCampaignEntryKind, Date | null>>;
  }): void {
    const prior = this.#byResource.get(resource);
    if (prior?.completed) fail("INVALID_RESOURCE_MANIFEST");
    if (
      prior
      && (prior.sourceArchiveUrl !== manifest.sourceArchiveUrl
        || manifest.sourceExtractedAt === null
        || prior.sourceExtractedAt?.getTime() !== manifest.sourceExtractedAt.getTime())
    ) fail("INCONSISTENT_SOURCE_METADATA");
    if (manifest.sourceExtractedAt && Number.isNaN(manifest.sourceExtractedAt.getTime())) {
      fail("INVALID_SOURCE_EXTRACTED_AT");
    }
    let entryKindSourceExtractedAt: Record<TseCampaignEntryKind, Date | null> | undefined;
    if (resource === "campaignAccounts") {
      const manifestSubtypes = manifest.entryKindSourceExtractedAt;
      if (
        !manifestSubtypes
        || Object.keys(manifestSubtypes).length !== TSE_CAMPAIGN_ENTRY_KINDS.length
        || TSE_CAMPAIGN_ENTRY_KINDS.some((kind) => !Object.hasOwn(manifestSubtypes, kind))
      ) fail("INVALID_RESOURCE_MANIFEST");
      entryKindSourceExtractedAt = Object.fromEntries(TSE_CAMPAIGN_ENTRY_KINDS.map((kind) => {
        const timestamp = manifestSubtypes[kind];
        if (timestamp && Number.isNaN(timestamp.getTime())) fail("INVALID_SOURCE_EXTRACTED_AT");
        const observed = prior?.entryKindSourceExtractedAt?.[kind];
        if (observed && observed.getTime() !== timestamp?.getTime()) {
          fail("INCONSISTENT_SOURCE_METADATA");
        }
        return [kind, timestamp];
      })) as Record<TseCampaignEntryKind, Date | null>;
      const latest = TSE_CAMPAIGN_ENTRY_KINDS
        .map((kind) => entryKindSourceExtractedAt![kind])
        .filter((timestamp): timestamp is Date => timestamp !== null)
        .reduce<Date | null>((maximum, timestamp) =>
          !maximum || timestamp > maximum ? timestamp : maximum, null);
      if (
        latest?.getTime() !== manifest.sourceExtractedAt?.getTime()
        || (latest === null) !== (manifest.sourceExtractedAt === null)
      ) fail("INCONSISTENT_SOURCE_METADATA");
    }
    this.#byResource.set(resource, {
      sourceArchiveUrl: manifest.sourceArchiveUrl,
      sourceExtractedAt: manifest.sourceExtractedAt,
      ...(entryKindSourceExtractedAt ? { entryKindSourceExtractedAt } : {}),
      completed: true,
    });
  }

  timestamp(resource: TseResourceName): Date | null {
    const provenance = this.#byResource.get(resource);
    if (!provenance?.completed) return fail("MISSING_RESOURCE_MANIFEST");
    return provenance.sourceExtractedAt;
  }

  manifest(): ElectoralTabularResourceProvenance {
    return Object.fromEntries(tabularResourceNames.map((resource) => {
      const provenance = this.#byResource.get(resource);
      if (!provenance?.completed) return fail("MISSING_RESOURCE_MANIFEST");
      return [resource, {
        sourceArchiveUrl: provenance.sourceArchiveUrl,
        sourceExtractedAt: provenance.sourceExtractedAt,
        ...(provenance.entryKindSourceExtractedAt
          ? { entryKindSourceExtractedAt: provenance.entryKindSourceExtractedAt }
          : {}),
      }];
    })) as ElectoralTabularResourceProvenance;
  }
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
  metadata: OfficialSourceMetadata,
  consume: (entry: RowEntry, sourceExtractedAt: Date) => void,
): Promise<void> {
  let manifestSeen = false;
  for await (const event of client.streamResource(resource)) {
    if (event.type === "manifest") {
      if (manifestSeen || event.resource !== resource) fail("INVALID_RESOURCE_MANIFEST");
      manifestSeen = true;
      const expectedKinds = resource === "campaignAccounts"
        ? ["campaignReceipts", "campaignContractedExpenses", "campaignPaidExpenses"]
        : [resource];
      const actualKinds = new Set(event.entryKinds);
      if (
        actualKinds.size !== expectedKinds.length
        || expectedKinds.some((kind) => !actualKinds.has(kind))
      ) {
        fail(resource === "campaignAccounts"
          ? "MISSING_CAMPAIGN_SUBTYPE"
          : "INVALID_RESOURCE_MANIFEST");
      }
      metadata.complete(resource, event);
      continue;
    }
    if (manifestSeen) fail("INVALID_RESOURCE_MANIFEST");
    const { type: _type, ...entry } = event;
    assertEntryKind(resource, entry.entryKind);
    if (resource === "campaignAccounts") {
      resources[entry.entryKind as "campaignReceipts"] += 1;
    } else {
      resources[resource] += 1;
    }
    consume(entry, metadata.observe(
      resource,
      entry.entryKind,
      entry.row,
      entry.sourceArchiveUrl,
      entry.sourceExtractedAt,
    ));
  }
  if (!manifestSeen) fail("MISSING_RESOURCE_MANIFEST");
}

function officialMediaEntryUrl(sourceArchiveUrl: string, originalFilename: string): string {
  const url = new URL(sourceArchiveUrl);
  const hostname = url.hostname.toLocaleLowerCase("en-US");
  if (
    url.protocol !== "https:"
    || !(hostname === "tse.jus.br" || hostname.endsWith(".tse.jus.br"))
  ) return fail("INVALID_MEDIA_SOURCE_URL");
  url.hash = new URLSearchParams({ entry: originalFilename }).toString();
  return url.toString();
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
  let retainPublishedGeneration = false;

  try {
    previousRunId = await repository.findLatestSuccessfulSyncRun(options.electionYear);
    await mediaStore.prepare(runId);
    const sourceMetadata = new OfficialSourceMetadata();
    const rawCandidates = new Map<string, { row: TseRow; sourceArchiveUrl: string }>();
    await consumeResource(client, "candidates", resources, sourceMetadata, (entry) => {
      assertRowYear(entry.row, options.electionYear);
      const externalId = candidateExternalId(entry.row);
      if (rawCandidates.has(externalId)) fail("DUPLICATE_CANDIDATE");
      rawCandidates.set(externalId, {
        row: pickPublicRow(entry.row, candidateRowAllowlist),
        sourceArchiveUrl: entry.sourceArchiveUrl,
      });
    });
    if (rawCandidates.size === 0) fail("EMPTY_CANDIDATE_RESOURCE");
    await consumeResource(client, "complements", resources, sourceMetadata, (entry) => {
      mergeComplement(
        rawCandidates,
        pickPublicRow(entry.row, [
          "ANO_ELEICAO", "AA_ELEICAO", "SQ_CANDIDATO", ...complementAllowlist,
        ]),
        options.electionYear,
      );
    });
    const coalitionByKey = new Map<string, CoalitionEnrichment>();
    await consumeResource(client, "coalitions", resources, sourceMetadata, (entry) => {
      collectCoalition(
        coalitionByKey,
        pickPublicRow(entry.row, coalitionRowAllowlist),
        options.electionYear,
      );
    });
    applyCoalitions(rawCandidates, coalitionByKey);
    const candidateSourceExtractedAt = sourceMetadata.timestamp("candidates")
      ?? fail("MISSING_SOURCE_METADATA");

    const candidates: ElectoralSnapshot["candidates"] = [...rawCandidates.values()].map(({ row, sourceArchiveUrl }) => ({
      ...mapCandidateRow(row, startedAt),
      sourceArchiveUrl,
      sourceExtractedAt: candidateSourceExtractedAt,
      photoStorageKey: null,
      photoSourceArchiveUrl: null,
      photoOriginalFilename: null,
      photoMimeType: null,
      photoSourceExtractedAt: null,
      photoCheckedAt: null,
    }));
    const candidateByExternalId = new Map(candidates.map((candidate) => [candidate.externalId, candidate]));
    const warnings: string[] = [];
    let orphanTabularEntries = 0;
    let duplicateSocialLinks = 0;

    const assets: ElectoralSnapshot["assets"] = [];
    await consumeResource(client, "assets", resources, sourceMetadata, (entry, extractedAt) => {
      assertRowYear(entry.row, options.electionYear);
      const mapped = mapAssetRow(entry.row);
      assets.push({
        ...mapped,
        sourceArchiveUrl: entry.sourceArchiveUrl,
        sourceExtractedAt: extractedAt,
        checkedAt: startedAt,
      });
    });
    const socialLinks: ElectoralSnapshot["socialLinks"] = [];
    const socialLinkKeys = new Set<string>();
    await consumeResource(client, "social", resources, sourceMetadata, (entry, extractedAt) => {
      assertRowYear(entry.row, options.electionYear);
      const mapped = mapSocialRow(entry.row);
      if (mapped) {
        if (!candidateByExternalId.has(mapped.candidateExternalId)) {
          orphanTabularEntries += 1;
        } else {
          const key = JSON.stringify([mapped.candidateExternalId, mapped.url]);
          if (socialLinkKeys.has(key)) {
            duplicateSocialLinks += 1;
            return;
          }
          socialLinkKeys.add(key);
          socialLinks.push({
            ...mapped,
            sourceArchiveUrl: entry.sourceArchiveUrl,
            sourceExtractedAt: extractedAt,
            checkedAt: startedAt,
          });
        }
      }
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
    await consumeResource(client, "campaignAccounts", resources, sourceMetadata, (entry, extractedAt) => {
      assertRowYear(entry.row, options.electionYear);
      if (entry.entryKind === "campaignPaidExpenses") {
        moneyToCents(value(entry.row, "VR_PAGTO_DESPESA") ?? fail("MISSING_CAMPAIGN_VALUE"));
        return;
      }
      const externalId = candidateExternalId(entry.row);
      if (!candidateByExternalId.has(externalId)) fail("ORPHAN_CAMPAIGN_ENTRY");
      const provenance = {
        sourceArchiveUrl: entry.sourceArchiveUrl,
        sourceExtractedAt: extractedAt,
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
      }
    });
    const campaignEntries = [...campaignByCandidateKindCategory.values()];
    const extractedAt = candidateSourceExtractedAt;

    const governmentPlans: ElectoralSnapshot["governmentPlans"] = [];
    const documents: ElectoralSnapshot["documents"] = [];
    let orphanMediaEntries = 0;
    for (const kind of mediaKinds) {
      for (const region of TSE_REGIONS) {
        for await (const entry of client.streamRegionalMedia(kind, region)) {
          const candidate = candidateByExternalId.get(entry.candidateExternalId);
          if (!candidate) {
            for await (const _chunk of entry.content) void _chunk;
            orphanMediaEntries += 1;
            continue;
          }
          const storageKey = await mediaStore.stage(runId, entry);
          resources[kind] += 1;
          if (kind === "photos") {
            if (candidate.photoStorageKey) fail("DUPLICATE_CANDIDATE_PHOTO");
            candidate.photoStorageKey = storageKey;
            candidate.photoSourceArchiveUrl = entry.sourceArchiveUrl;
            candidate.photoOriginalFilename = entry.originalFilename;
            candidate.photoMimeType = entry.mimeType;
            candidate.photoSourceExtractedAt = null;
            candidate.photoCheckedAt = startedAt;
          } else if (kind === "governmentPlans") {
            governmentPlans.push({
              electionYear: options.electionYear,
              candidateExternalId: entry.candidateExternalId,
              officialUrl: officialMediaEntryUrl(entry.sourceArchiveUrl, entry.originalFilename),
              storageKey,
              originalFilename: entry.originalFilename,
              mimeType: entry.mimeType,
              sourceArchiveUrl: entry.sourceArchiveUrl,
              sourceExtractedAt: null,
              checkedAt: startedAt.toISOString(),
            });
          } else {
            documents.push({
              electionYear: options.electionYear,
              candidateExternalId: entry.candidateExternalId,
              label: "Certidão criminal publicada pelo TSE",
              officialUrl: officialMediaEntryUrl(entry.sourceArchiveUrl, entry.originalFilename),
              storageKey,
              originalFilename: entry.originalFilename,
              mimeType: entry.mimeType,
              sourceArchiveUrl: entry.sourceArchiveUrl,
              sourceExtractedAt: null,
              checkedAt: startedAt.toISOString(),
            });
          }
        }
      }
    }
    if (orphanTabularEntries > 0) warnings.push("ORPHAN_TABULAR_ENTRIES_SKIPPED");
    if (duplicateSocialLinks > 0) warnings.push("DUPLICATE_SOCIAL_LINKS_SKIPPED");
    if (orphanMediaEntries > 0) warnings.push("ORPHAN_MEDIA_ENTRIES_SKIPPED");

    const snapshot: ElectoralSnapshot = {
      syncRunId: runId,
      electionYear: options.electionYear,
      extractedAt,
      resourceProvenance: sourceMetadata.manifest(),
      sourceUrl: client.resourceUrl("candidates"),
      candidates,
      assets,
      campaignEntries,
      socialLinks,
      governmentPlans,
      documents,
    };
    await mediaStore.publish(runId);
    try {
      await repository.persistSnapshot(snapshot);
      persisted = true;
    } catch (persistenceError) {
      let outcome: Awaited<ReturnType<ElectionRepository["findSyncRunOutcome"]>>;
      try {
        outcome = await repository.findSyncRunOutcome(options.electionYear, runId);
      } catch {
        retainPublishedGeneration = true;
        throw new TseContractError("PERSISTENCE_OUTCOME_UNKNOWN");
      }
      if (
        outcome?.status === "successful"
        && outcome.candidateGenerationCount === candidates.length
      ) {
        persisted = true;
        warnings.push("PERSISTENCE_ACKNOWLEDGEMENT_RECOVERED");
      } else if (outcome?.status === "running" || outcome?.status === "successful") {
        retainPublishedGeneration = true;
        throw new TseContractError("PERSISTENCE_OUTCOME_UNKNOWN");
      } else {
        throw persistenceError;
      }
    }

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
      if (retainPublishedGeneration) {
        const failedAt = options.now();
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
