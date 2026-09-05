import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import type { TseMediaEntry, TseRegion } from "#/integrations/tse/client";
import { TseContractError } from "#/integrations/tse/mapper";
import { syncElection } from "#/jobs/sync-election";

type Resource = "candidates" | "complements" | "assets" | "coalitions" | "social" | "campaignAccounts";
type EntryKind = Resource | "campaignReceipts" | "campaignContractedExpenses" | "campaignPaidExpenses";
type CampaignEntryKind = "campaignReceipts" | "campaignContractedExpenses" | "campaignPaidExpenses";
const campaignEntryKinds = [
  "campaignReceipts", "campaignContractedExpenses", "campaignPaidExpenses",
] as const satisfies readonly CampaignEntryKind[];

const checkedAt = new Date("2026-09-05T12:00:00.000Z");
const candidateId = "260001234567";

const baseRows: Record<Resource, Array<{ row: Record<string, string>; entryKind: EntryKind }>> = {
  candidates: [{
    entryKind: "candidates",
    row: {
      ANO_ELEICAO: "2026",
      SQ_CANDIDATO: candidateId,
      NM_CANDIDATO: "ANA CIDADÃ",
      NM_URNA_CANDIDATO: "ANA",
      NR_CANDIDATO: "1234",
      NR_TURNO: "1",
      DS_CARGO: "DEPUTADO FEDERAL",
      SG_UF: "ES",
      SG_UE: "ES",
      NM_UE: "ESPÍRITO SANTO",
      SG_PARTIDO: "ABC",
      NR_PARTIDO: "12",
      NM_PARTIDO: "PARTIDO ABC",
      SQ_COLIGACAO: "260000000001",
      DS_SITUACAO_CANDIDATURA: "APTO",
    },
  }],
  complements: [{
    entryKind: "complements",
    row: {
      ANO_ELEICAO: "2026",
      SQ_CANDIDATO: candidateId,
      DS_OCUPACAO: "PROFESSORA",
      DS_GRAU_INSTRUCAO: "SUPERIOR COMPLETO",
    },
  }],
  assets: [{
    entryKind: "assets",
      row: {
        ANO_ELEICAO: "2026",
        SQ_CANDIDATO: candidateId,
        NR_ORDEM_BEM_CANDIDATO: "1",
        DS_TIPO_BEM_CANDIDATO: "Outros",
      DS_BEM_CANDIDATO: "Bem declarado",
      VR_BEM_CANDIDATO: "0,00",
    },
  }],
  coalitions: [{
    entryKind: "coalitions",
    row: {
      ANO_ELEICAO: "2026",
      NR_TURNO: "1",
      SG_UF: "ES",
      SG_UE: "ES",
      DS_CARGO: "DEPUTADO FEDERAL",
      SG_PARTIDO: "ABC",
      SQ_COLIGACAO: "260000000001",
      NM_COLIGACAO: "UNIÃO CIDADÃ",
    },
  }],
  social: [{
    entryKind: "social",
    row: {
      ANO_ELEICAO: "2026",
      SQ_CANDIDATO: candidateId,
      DS_URL: "https://example.org/ana",
    },
  }],
  campaignAccounts: [
    {
      entryKind: "campaignReceipts",
      row: {
        ANO_ELEICAO: "2026",
        SQ_CANDIDATO: candidateId,
        VR_RECEITA: "100,00",
        DS_ORIGEM_RECEITA: "Recursos de pessoas físicas",
      },
    },
    {
      entryKind: "campaignContractedExpenses",
      row: {
        ANO_ELEICAO: "2026",
        SQ_CANDIDATO: candidateId,
        VR_DESPESA_CONTRATADA: "40,00",
        DS_TIPO_DESPESA: "Publicidade",
      },
    },
    {
      entryKind: "campaignPaidExpenses",
      row: {
        AA_ELEICAO: "2026",
        SQ_PRESTADOR_CONTAS: "260000000001",
        VR_PAGTO_DESPESA: "35,00",
      },
    },
  ],
};

function cloneRows() {
  return Object.fromEntries(Object.entries(baseRows).map(([resource, entries]) => [
    resource,
    entries.map((entry) => ({ ...entry, row: { ...entry.row } })),
  ])) as typeof baseRows;
}

function officialInstant(metadata: { date: string; time: string }): Date {
  const [day, month, year] = metadata.date.split("/");
  return new Date(`${year}-${month}-${day}T${metadata.time}-03:00`);
}

class FakeClient {
  readonly calls: string[] = [];
  readonly rows: ReturnType<typeof cloneRows>;
  readonly failure: { resource: Resource; error: Error } | undefined;
  readonly manifestKinds: Partial<Record<Resource, string[]>>;
  readonly generatedAt: Partial<Record<Resource, { date: string; time: string }>>;
  readonly certificateCount: number;

  constructor(
    rows = cloneRows(),
    failure?: { resource: Resource; error: Error },
    options: {
      manifestKinds?: Partial<Record<Resource, string[]>>;
      generatedAt?: Partial<Record<Resource, { date: string; time: string }>>;
      certificateCount?: number;
    } = {},
  ) {
    this.rows = rows;
    this.failure = failure;
    this.manifestKinds = options.manifestKinds ?? {};
    this.generatedAt = options.generatedAt ?? {};
    this.certificateCount = options.certificateCount ?? 1;
  }

  resourceUrl(resource: Resource) {
    return `https://cdn.tse.jus.br/${resource}.zip`;
  }

  async *streamRowEntries(resource: Resource) {
    this.calls.push(`rows:${resource}`);
    if (this.failure?.resource === resource) throw this.failure.error;
    for (const entry of this.rows[resource]) {
      const generatedAt = this.generatedAt[resource] ?? {
        date: "05/09/2026",
        time: "08:00:00",
      };
      const row = {
        DT_GERACAO: generatedAt.date,
        HH_GERACAO: generatedAt.time,
        ...entry.row,
      };
      yield {
        ...entry,
        row,
        sourceArchiveUrl: this.resourceUrl(resource),
        sourceExtractedAt: officialInstant({
          date: row.DT_GERACAO,
          time: row.HH_GERACAO,
        }),
      };
    }
  }

  async *streamResource(resource: Resource) {
    for await (const entry of this.streamRowEntries(resource)) {
      yield { type: "row" as const, ...entry };
    }
    const defaults = resource === "campaignAccounts"
      ? ["campaignReceipts", "campaignContractedExpenses", "campaignPaidExpenses"]
      : [resource];
    const entryKindSourceExtractedAt = resource === "campaignAccounts"
      ? Object.fromEntries(campaignEntryKinds.map((kind) => {
        const entry = this.rows.campaignAccounts.find((candidate) => candidate.entryKind === kind);
        if (!entry) return [kind, null];
        const generatedAt = this.generatedAt.campaignAccounts ?? { date: "05/09/2026", time: "08:00:00" };
        return [kind, officialInstant({
          date: entry.row.DT_GERACAO ?? generatedAt.date,
          time: entry.row.HH_GERACAO ?? generatedAt.time,
        })];
      })) as Record<CampaignEntryKind, Date | null>
      : undefined;
    const campaignInstants = Object.values(entryKindSourceExtractedAt ?? {})
      .filter((instant): instant is Date => instant instanceof Date);
    yield {
      type: "manifest" as const,
      resource,
      entryKinds: this.manifestKinds[resource] ?? defaults,
      sourceArchiveUrl: this.resourceUrl(resource),
      sourceExtractedAt: resource === "campaignAccounts"
        ? campaignInstants.reduce<Date | null>((latest, instant) =>
          !latest || instant > latest ? instant : latest, null)
        : this.rows[resource].length === 0
          ? null
          : officialInstant(this.generatedAt[resource] ?? {
          date: "05/09/2026",
          time: "08:00:00",
        }),
      ...(entryKindSourceExtractedAt ? { entryKindSourceExtractedAt } : {}),
    };
  }

  async *streamRegionalMedia(kind: TseMediaEntry["kind"], region: TseRegion) {
    this.calls.push(`media:${kind}:${region}`);
    if (region !== "ES") return;
    const extension = kind === "photos" ? "jpg" : "pdf";
    const count = kind === "certificates" ? this.certificateCount : 1;
    for (let index = 0; index < count; index += 1) {
      yield {
        kind,
        region,
        candidateExternalId: candidateId,
        originalFilename: `${kind}_${candidateId}_${index + 1}.${extension}`,
        mimeType: kind === "photos" ? "image/jpeg" : "application/pdf",
        sourceArchiveUrl: `https://cdn.tse.jus.br/${kind}_${region}.zip`,
        content: Readable.from([`${kind}-${index + 1}`]),
      } as TseMediaEntry;
    }
  }
}

class FakeMediaStore {
  readonly events: string[];
  published = false;
  discarded: string[] = [];
  removed: string[] = [];

  constructor(events: string[]) {
    this.events = events;
  }

  async prepare(runId: string) {
    this.events.push(`prepare:${runId}`);
  }

  async stage(runId: string, entry: TseMediaEntry) {
    for await (const _chunk of entry.content) void _chunk;
    this.events.push(`stage:${entry.kind}`);
    return `${runId}/${entry.kind}/${entry.candidateExternalId}/${entry.originalFilename}`;
  }

  async publish(runId: string) {
    this.published = true;
    this.events.push(`publish:${runId}`);
  }

  async discard(runId: string) {
    this.discarded.push(runId);
    this.events.push(`discard:${runId}`);
  }

  async removePublished(runId: string) {
    this.removed.push(runId);
    this.events.push(`remove:${runId}`);
  }
}

class FakeRepository {
  readonly events: string[];
  readonly previousRun: string;
  readonly persistError: Error | undefined;
  readonly minimumExtractedAt: Date | undefined;
  snapshots: any[] = [];
  failures: any[] = [];
  pending: any[] = [];
  outcome: { status: "running" | "successful" | "failed"; candidateGenerationCount: number } | null = null;
  outcomeError: Error | undefined;

  constructor(
    events: string[],
    previousRun = "previous-generation",
    persistError?: Error,
    minimumExtractedAt?: Date,
  ) {
    this.events = events;
    this.previousRun = previousRun;
    this.persistError = persistError;
    this.minimumExtractedAt = minimumExtractedAt;
  }

  async findLatestSuccessfulSyncRun() {
    return this.previousRun;
  }

  async persistSnapshot(snapshot: unknown) {
    if (this.persistError) {
      this.events.push("persist-failed");
      throw this.persistError;
    }
    if (
      this.minimumExtractedAt
      && (snapshot as { extractedAt: Date }).extractedAt < this.minimumExtractedAt
    ) {
      this.events.push("persist-stale");
      throw new Error("Cannot publish a stale electoral snapshot");
    }
    this.snapshots.push(snapshot);
    this.events.push("persist");
  }

  async findSyncRunOutcome() {
    this.events.push("outcome");
    if (this.outcomeError) throw this.outcomeError;
    return this.outcome;
  }

  async recordFailure(failure: unknown) {
    this.failures.push(failure);
    this.events.push("failure");
  }

  async listLawmakersForCandidateReconciliation() {
    return [{
      id: "law-1",
      source: "camara" as const,
      externalId: "220530",
      name: "Ana Cidada",
      electoralName: "Ana Cidada",
      role: "deputado_federal" as const,
      party: "ABC",
      region: "ES",
    }];
  }

  async createPendingLawmakerLinkByExternalReferences(suggestion: unknown) {
    this.pending.push(suggestion);
  }
}

function acquiredLock(events: string[]) {
  return async <T>(name: string, operation: () => Promise<T>) => {
    events.push(`lock:${name}`);
    return { acquired: true as const, value: await operation() };
  };
}

describe("syncElection", () => {
  it("publishes a complete 2026 snapshot after consuming every required resource and media region", async () => {
    const events: string[] = [];
    const client = new FakeClient();
    const media = new FakeMediaStore(events);
    const repository = new FakeRepository(events);

    const report = await syncElection(client, media, repository, {
      electionYear: 2026,
      now: () => checkedAt,
      withLock: acquiredLock(events),
    });

    expect(report).toMatchObject({
      failed: false,
      candidates: 1,
      resources: {
        candidates: 1,
        complements: 1,
        assets: 1,
        coalitions: 1,
        social: 1,
        campaignReceipts: 1,
        campaignContractedExpenses: 1,
        campaignPaidExpenses: 1,
        photos: 1,
        governmentPlans: 1,
        certificates: 1,
      },
    });
    expect(client.calls.filter((call) => call.startsWith("media:"))).toHaveLength(84);
    expect(repository.snapshots).toHaveLength(1);
    expect(repository.snapshots[0]).toMatchObject({
      electionYear: 2026,
      candidates: [{ occupation: "PROFESSORA", coalition: "UNIÃO CIDADÃ" }],
      campaignEntries: [
        { kind: "receipt", valueCents: 10_000n, category: "Recursos privados" },
        { kind: "expense", valueCents: 4_000n, category: "Publicidade" },
      ],
    });
    expect(repository.pending).toEqual([expect.objectContaining({
      candidateExternalId: candidateId,
      lawmakerExternalId: "220530",
      status: "pending",
    })]);
    expect(media.discarded).toEqual([]);
    expect(media.removed).toEqual(["previous-generation"]);
    expect(events.findIndex((event) => event === "persist"))
      .toBeLessThan(events.findIndex((event) => event === "remove:previous-generation"));
  });

  it("drains and reports official media with no candidate in the same snapshot", async () => {
    const baseClient = new FakeClient();
    let orphanDrained = false;
    const client = {
      resourceUrl: baseClient.resourceUrl.bind(baseClient),
      streamResource: baseClient.streamResource.bind(baseClient),
      async *streamRegionalMedia(kind: TseMediaEntry["kind"], region: TseRegion) {
        yield* baseClient.streamRegionalMedia(kind, region);
        if (kind === "governmentPlans" && region === "PI") {
          yield {
            kind,
            region,
            candidateExternalId: "260009876543",
            originalFilename: "2026PI260009876543_01.pdf",
            mimeType: "application/pdf" as const,
            sourceArchiveUrl: "https://cdn.tse.jus.br/governmentPlans_PI.zip",
            content: Readable.from((async function* () {
              yield "%PDF-1.7";
              orphanDrained = true;
            })()),
          };
        }
      },
    };
    const repository = new FakeRepository([]);

    const report = await syncElection(
      client,
      new FakeMediaStore([]),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock([]) },
    );

    expect(report).toMatchObject({
      failed: false,
      warnings: ["ORPHAN_MEDIA_ENTRIES_SKIPPED"],
    });
    expect(orphanDrained).toBe(true);
    expect(repository.snapshots[0].governmentPlans).toHaveLength(1);
  });

  it("does not publish a social link whose candidate is absent from the same snapshot", async () => {
    const rows = cloneRows();
    rows.social.push({
      entryKind: "social",
      row: {
        ANO_ELEICAO: "2026",
        SQ_CANDIDATO: "260009876543",
        DS_URL: "https://example.org/orphan",
      },
    });
    const repository = new FakeRepository([]);

    const report = await syncElection(
      new FakeClient(rows),
      new FakeMediaStore([]),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock([]) },
    );

    expect(report).toMatchObject({
      failed: false,
      warnings: ["ORPHAN_TABULAR_ENTRIES_SKIPPED"],
    });
    expect(repository.snapshots[0].socialLinks).toHaveLength(1);
  });

  it("publishes one social link when the official source repeats a candidate URL", async () => {
    const rows = cloneRows();
    rows.social.push(structuredClone(rows.social[0]!));
    const repository = new FakeRepository([]);

    const report = await syncElection(
      new FakeClient(rows),
      new FakeMediaStore([]),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock([]) },
    );

    expect(report).toMatchObject({
      failed: false,
      warnings: ["DUPLICATE_SOCIAL_LINKS_SKIPPED"],
    });
    expect(repository.snapshots[0].socialLinks).toHaveLength(1);
  });

  it("validates official paid expenses without treating the account id as a candidate id", async () => {
    const rows = cloneRows();
    rows.campaignAccounts[2]!.row = {
      AA_ELEICAO: "2026",
      SQ_PRESTADOR_CONTAS: "260000000001",
      VR_PAGTO_DESPESA: "35,00",
    };

    const report = await syncElection(
      new FakeClient(rows),
      new FakeMediaStore([]),
      new FakeRepository([]),
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock([]) },
    );

    expect(report).toMatchObject({
      failed: false,
      resources: { campaignPaidExpenses: 1 },
    });
  });

  it("preserves each campaign subtype generation time instead of overwriting with the aggregate max", async () => {
    const rows = cloneRows();
    Object.assign(rows.campaignAccounts[0]!.row, { DT_GERACAO: "04/09/2026", HH_GERACAO: "04:05:48" });
    Object.assign(rows.campaignAccounts[1]!.row, { DT_GERACAO: "04/09/2026", HH_GERACAO: "04:05:47" });
    Object.assign(rows.campaignAccounts[2]!.row, { DT_GERACAO: "04/09/2026", HH_GERACAO: "04:05:40" });
    const repository = new FakeRepository([]);

    const report = await syncElection(
      new FakeClient(rows, undefined, {
        generatedAt: { campaignAccounts: { date: "04/09/2026", time: "04:05:48" } },
      }),
      new FakeMediaStore([]),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock([]) },
    );

    expect(report.failed).toBe(false);
    expect(repository.snapshots[0].campaignEntries.map((entry: any) => entry.sourceExtractedAt))
      .toEqual([new Date("2026-09-04T07:05:48.000Z"), new Date("2026-09-04T07:05:47.000Z")]);
    expect(repository.snapshots[0].resourceProvenance.campaignAccounts)
      .toMatchObject({
        sourceExtractedAt: new Date("2026-09-04T07:05:48.000Z"),
        entryKindSourceExtractedAt: {
          campaignReceipts: new Date("2026-09-04T07:05:48.000Z"),
          campaignContractedExpenses: new Date("2026-09-04T07:05:47.000Z"),
          campaignPaidExpenses: new Date("2026-09-04T07:05:40.000Z"),
        },
      });
  });

  it("records a stable failure and discards only the new generation on a required-resource error", async () => {
    const events: string[] = [];
    const client = new FakeClient(cloneRows(), {
      resource: "assets",
      error: new TseContractError("MISSING_COLUMNS"),
    });
    const media = new FakeMediaStore(events);
    const repository = new FakeRepository(events);

    const report = await syncElection(client, media, repository, {
      electionYear: 2026,
      now: () => checkedAt,
      withLock: acquiredLock(events),
    });

    expect(report).toMatchObject({ failed: true, errorCode: "MISSING_COLUMNS" });
    expect(repository.snapshots).toHaveLength(0);
    expect(repository.failures).toEqual([expect.objectContaining({ errorCode: "MISSING_COLUMNS" })]);
    expect(media.published).toBe(false);
    expect(media.discarded).toHaveLength(1);
    expect(media.removed).toEqual([]);
  });

  it("rolls back only the newly published media generation when snapshot persistence fails", async () => {
    const events: string[] = [];
    const media = new FakeMediaStore(events);
    const repository = new FakeRepository(
      events,
      "previous-generation",
      new Error("database unavailable"),
    );

    const report = await syncElection(new FakeClient(), media, repository, {
      electionYear: 2026,
      now: () => checkedAt,
      withLock: acquiredLock(events),
    });

    expect(report).toMatchObject({ failed: true, errorCode: "ELECTORAL_SYNC_FAILED" });
    expect(media.published).toBe(true);
    expect(media.discarded).toEqual([expect.stringMatching(/^election-2026-/)]);
    expect(media.removed).toEqual([]);
    expect(events.findIndex((event) => event.startsWith("publish:")))
      .toBeLessThan(events.findIndex((event) => event === "persist-failed"));
    expect(events.findIndex((event) => event === "persist-failed"))
      .toBeLessThan(events.findIndex((event) => event.startsWith("discard:")));
  });

  it("recovers truthful success when persistence commits and only its acknowledgement throws", async () => {
    const events: string[] = [];
    const media = new FakeMediaStore(events);
    const repository = new FakeRepository(events, "previous-generation", new Error("ack lost"));
    repository.outcome = { status: "successful", candidateGenerationCount: 1 };

    const report = await syncElection(new FakeClient(), media, repository, {
      electionYear: 2026,
      now: () => checkedAt,
      withLock: acquiredLock(events),
    });

    expect(report).toMatchObject({
      failed: false,
      candidates: 1,
      warnings: expect.arrayContaining(["PERSISTENCE_ACKNOWLEDGEMENT_RECOVERED"]),
    });
    expect(media.discarded).toEqual([]);
    expect(media.removed).toEqual(["previous-generation"]);
    expect(repository.failures).toEqual([]);
  });

  it("retains published media while a pending persistence outcome remains ambiguous", async () => {
    const events: string[] = [];
    const media = new FakeMediaStore(events);
    const repository = new FakeRepository(events, "previous-generation", new Error("ack lost"));
    repository.outcome = { status: "running", candidateGenerationCount: 1 };

    const report = await syncElection(new FakeClient(), media, repository, {
      electionYear: 2026,
      now: () => checkedAt,
      withLock: acquiredLock(events),
    });

    expect(report).toMatchObject({ failed: true, errorCode: "PERSISTENCE_OUTCOME_UNKNOWN" });
    expect(media.discarded).toEqual([]);
    expect(media.removed).toEqual([]);
    expect(repository.failures).toEqual([]);
  });

  it("discards published media after a definitively failed persistence outcome", async () => {
    const events: string[] = [];
    const media = new FakeMediaStore(events);
    const repository = new FakeRepository(events, "previous-generation", new Error("commit failed"));
    repository.outcome = { status: "failed", candidateGenerationCount: 0 };

    const report = await syncElection(new FakeClient(), media, repository, {
      electionYear: 2026,
      now: () => checkedAt,
      withLock: acquiredLock(events),
    });

    expect(report).toMatchObject({ failed: true, errorCode: "ELECTORAL_SYNC_FAILED" });
    expect(media.discarded).toHaveLength(1);
    expect(repository.failures).toHaveLength(1);
  });

  it("retains published media when the persistence status check itself fails", async () => {
    const events: string[] = [];
    const media = new FakeMediaStore(events);
    const repository = new FakeRepository(events, "previous-generation", new Error("ack lost"));
    repository.outcomeError = new Error("status unavailable");

    const report = await syncElection(new FakeClient(), media, repository, {
      electionYear: 2026,
      now: () => checkedAt,
      withLock: acquiredLock(events),
    });

    expect(report).toMatchObject({ failed: true, errorCode: "PERSISTENCE_OUTCOME_UNKNOWN" });
    expect(media.discarded).toEqual([]);
    expect(repository.failures).toEqual([]);
  });

  it("does no work when the PostgreSQL advisory lock is already held", async () => {
    const events: string[] = [];
    const client = new FakeClient();
    const media = new FakeMediaStore(events);
    const repository = new FakeRepository(events);

    const report = await syncElection(client, media, repository, {
      electionYear: 2026,
      now: () => checkedAt,
      withLock: async (name) => {
        events.push(`lock:${name}`);
        return { acquired: false as const };
      },
    });

    expect(report).toMatchObject({ failed: true, errorCode: "SYNC_ALREADY_RUNNING" });
    expect(client.calls).toEqual([]);
    expect(events).toEqual(["lock:electoral-sync-2026"]);
    expect(repository.failures).toEqual([]);
  });

  it("returns a serializable failure when acquiring the advisory lock fails", async () => {
    const events: string[] = [];
    const client = new FakeClient();

    await expect(syncElection(
      client,
      new FakeMediaStore(events),
      new FakeRepository(events),
      {
        electionYear: 2026,
        now: () => checkedAt,
        withLock: async () => { throw new Error("database offline"); },
      },
    )).resolves.toMatchObject({ failed: true, errorCode: "SYNC_LOCK_FAILED" });
    expect(client.calls).toEqual([]);
  });

  it("returns a stable failure when previous-generation discovery fails before staging", async () => {
    const events: string[] = [];
    const client = new FakeClient();
    const repository = new FakeRepository(events);
    repository.findLatestSuccessfulSyncRun = async () => {
      throw new Error("database unavailable");
    };

    await expect(syncElection(
      client,
      new FakeMediaStore(events),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    )).resolves.toMatchObject({ failed: true, errorCode: "ELECTORAL_SYNC_FAILED" });
    expect(client.calls).toEqual([]);
    expect(events.some((event) => event.startsWith("prepare:"))).toBe(false);
  });

  it("rejects unsupported election years before acquiring the lock", async () => {
    const events: string[] = [];
    const client = new FakeClient();

    const report = await syncElection(
      client,
      new FakeMediaStore(events),
      new FakeRepository(events),
      { electionYear: 2030, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report).toMatchObject({ failed: true, errorCode: "UNSUPPORTED_ELECTION_YEAR" });
    expect(events).toEqual([]);
    expect(client.calls).toEqual([]);
  });

  it("rejects conflicting coalition matches instead of guessing", async () => {
    const events: string[] = [];
    const rows = cloneRows();
    rows.coalitions.push({
      entryKind: "coalitions",
      row: { ...rows.coalitions[0]!.row, NM_COLIGACAO: "OUTRA COLIGAÇÃO" },
    });
    const repository = new FakeRepository(events);

    const report = await syncElection(
      new FakeClient(rows),
      new FakeMediaStore(events),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report).toMatchObject({ failed: true, errorCode: "CONFLICTING_COALITION_MATCH" });
    expect(repository.snapshots).toHaveLength(0);
  });

  it("distinguishes official coalitions with the same party and office by SQ_COLIGACAO", async () => {
    const events: string[] = [];
    const rows = cloneRows();
    rows.coalitions.push({
      entryKind: "coalitions",
      row: {
        ...rows.coalitions[0]!.row,
        SQ_COLIGACAO: "260000000002",
        NM_COLIGACAO: "OUTRA COLIGAÇÃO",
      },
    });
    const repository = new FakeRepository(events);

    const report = await syncElection(
      new FakeClient(rows),
      new FakeMediaStore(events),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report.failed).toBe(false);
    expect(repository.snapshots[0].candidates[0]).toMatchObject({
      coalition: "UNIÃO CIDADÃ",
    });
  });

  it("publishes a neutral unavailable status while the official description is not classified", async () => {
    const events: string[] = [];
    const rows = cloneRows();
    rows.candidates[0]!.row.CD_SITUACAO_CANDIDATURA = "-3";
    rows.candidates[0]!.row.DS_SITUACAO_CANDIDATURA = "#NULO#";
    const repository = new FakeRepository(events);

    const report = await syncElection(
      new FakeClient(rows),
      new FakeMediaStore(events),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report.failed).toBe(false);
    expect(repository.snapshots[0].candidates[0]).toMatchObject({
      status: "Não informado pelo TSE",
    });
  });

  it("requires all three campaign archive subtypes even when one would contain zero rows", async () => {
    const events: string[] = [];
    const rows = cloneRows();
    rows.campaignAccounts = rows.campaignAccounts.filter((entry) =>
      entry.entryKind !== "campaignPaidExpenses"
    );
    const repository = new FakeRepository(events);
    const client = new FakeClient(rows, undefined, {
      manifestKinds: {
        campaignAccounts: ["campaignReceipts", "campaignContractedExpenses"],
      },
    });

    const report = await syncElection(
      client,
      new FakeMediaStore(events),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report).toMatchObject({ failed: true, errorCode: "MISSING_CAMPAIGN_SUBTYPE" });
    expect(repository.snapshots).toHaveLength(0);
    expect(events.some((event) => event.startsWith("publish:"))).toBe(false);
  });

  it("uses official generation metadata for stale protection instead of local start time", async () => {
    const events: string[] = [];
    const repository = new FakeRepository(
      events,
      "previous-generation",
      undefined,
      new Date("2026-09-05T00:00:00.000Z"),
    );
    const generatedAt = Object.fromEntries([
      "candidates", "complements", "assets", "coalitions", "social", "campaignAccounts",
    ].map((resource) => [resource, { date: "04/09/2026", time: "08:00:00" }]));

    const report = await syncElection(
      new FakeClient(cloneRows(), undefined, { generatedAt }),
      new FakeMediaStore(events),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report).toMatchObject({ failed: true, errorCode: "ELECTORAL_SYNC_FAILED" });
    expect(events).toContain("persist-stale");
    expect(events.some((event) => event.startsWith("remove:previous-generation"))).toBe(false);
  });

  it("uses candidates as the snapshot instant and preserves every tabular resource provenance", async () => {
    const events: string[] = [];
    const repository = new FakeRepository(events, "");
    const generatedAt = {
      candidates: { date: "04/09/2026", time: "08:00:00" },
      complements: { date: "04/09/2026", time: "08:05:00" },
      assets: { date: "05/09/2026", time: "08:30:00" },
      coalitions: { date: "04/09/2026", time: "08:10:00" },
      social: { date: "04/09/2026", time: "08:15:00" },
      campaignAccounts: { date: "04/09/2026", time: "08:20:00" },
    };

    const report = await syncElection(
      new FakeClient(cloneRows(), undefined, { generatedAt }),
      new FakeMediaStore(events),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report.failed).toBe(false);
    expect(repository.snapshots[0].extractedAt).toEqual(new Date("2026-09-04T11:00:00.000Z"));
    expect(repository.snapshots[0].resourceProvenance).toEqual({
      candidates: {
        sourceArchiveUrl: "https://cdn.tse.jus.br/candidates.zip",
        sourceExtractedAt: new Date("2026-09-04T11:00:00.000Z"),
      },
      complements: {
        sourceArchiveUrl: "https://cdn.tse.jus.br/complements.zip",
        sourceExtractedAt: new Date("2026-09-04T11:05:00.000Z"),
      },
      assets: {
        sourceArchiveUrl: "https://cdn.tse.jus.br/assets.zip",
        sourceExtractedAt: new Date("2026-09-05T11:30:00.000Z"),
      },
      coalitions: {
        sourceArchiveUrl: "https://cdn.tse.jus.br/coalitions.zip",
        sourceExtractedAt: new Date("2026-09-04T11:10:00.000Z"),
      },
      social: {
        sourceArchiveUrl: "https://cdn.tse.jus.br/social.zip",
        sourceExtractedAt: new Date("2026-09-04T11:15:00.000Z"),
      },
      campaignAccounts: {
        sourceArchiveUrl: "https://cdn.tse.jus.br/campaignAccounts.zip",
        sourceExtractedAt: new Date("2026-09-04T11:20:00.000Z"),
        entryKindSourceExtractedAt: {
          campaignReceipts: new Date("2026-09-04T11:20:00.000Z"),
          campaignContractedExpenses: new Date("2026-09-04T11:20:00.000Z"),
          campaignPaidExpenses: new Date("2026-09-04T11:20:00.000Z"),
        },
      },
    });
    expect(repository.snapshots[0].candidates[0].sourceExtractedAt)
      .toEqual(new Date("2026-09-04T11:00:00.000Z"));
    expect(repository.snapshots[0].assets[0].sourceExtractedAt)
      .toEqual(new Date("2026-09-05T11:30:00.000Z"));
    expect(repository.snapshots[0].campaignEntries[0].sourceExtractedAt)
      .toEqual(new Date("2026-09-04T11:20:00.000Z"));
    expect(repository.snapshots[0].candidates[0].photoSourceExtractedAt).toBeNull();
    expect(repository.snapshots[0].governmentPlans[0].sourceExtractedAt).toBeNull();
    expect(repository.snapshots[0].documents[0].sourceExtractedAt).toBeNull();
  });

  it("accepts a complete campaign archive whose three present subtypes are all empty", async () => {
    const events: string[] = [];
    const rows = cloneRows();
    rows.campaignAccounts = [];
    const repository = new FakeRepository(events, "");

    const report = await syncElection(
      new FakeClient(rows),
      new FakeMediaStore(events),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report.failed).toBe(false);
    expect(repository.snapshots[0].campaignEntries).toEqual([]);
    expect(repository.snapshots[0].resourceProvenance.campaignAccounts).toEqual({
      sourceArchiveUrl: "https://cdn.tse.jus.br/campaignAccounts.zip",
      sourceExtractedAt: null,
      entryKindSourceExtractedAt: {
        campaignReceipts: null,
        campaignContractedExpenses: null,
        campaignPaidExpenses: null,
      },
    });
  });

  it("rejects inconsistent official generation metadata inside one resource", async () => {
    const events: string[] = [];
    const rows = cloneRows();
    rows.candidates.push({
      entryKind: "candidates",
      row: {
        ...rows.candidates[0]!.row,
        SQ_CANDIDATO: "260009876543",
        NM_CANDIDATO: "BIA PÚBLICA",
        NM_URNA_CANDIDATO: "BIA",
        DT_GERACAO: "04/09/2026",
      },
    });

    const report = await syncElection(
      new FakeClient(rows),
      new FakeMediaStore(events),
      new FakeRepository(events),
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report).toMatchObject({ failed: true, errorCode: "INCONSISTENT_SOURCE_METADATA" });
  });

  it("rejects an impossible official generation date deterministically", async () => {
    const events: string[] = [];
    const rows = cloneRows();
    rows.assets[0]!.row.DT_GERACAO = "31/02/2026";

    const report = await syncElection(
      new FakeClient(rows),
      new FakeMediaStore(events),
      new FakeRepository(events),
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report).toMatchObject({ failed: true, errorCode: "INVALID_SOURCE_EXTRACTED_AT" });
  });

  it("creates a stable distinct official URL identity for every candidate certificate", async () => {
    const events: string[] = [];
    const repository = new FakeRepository(events, "");

    const report = await syncElection(
      new FakeClient(cloneRows(), undefined, { certificateCount: 2 }),
      new FakeMediaStore(events),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report.failed).toBe(false);
    expect(repository.snapshots[0].documents).toHaveLength(2);
    expect(new Set(repository.snapshots[0].documents.map((document: any) => document.officialUrl)).size)
      .toBe(2);
    expect(repository.snapshots[0].documents.every((document: any) =>
      new URL(document.officialUrl).hostname === "cdn.tse.jus.br"
    )).toBe(true);
  });

  it("keeps matching declared coalition data and rejects conflicting coalition or federation enrichment", async () => {
    const matchingRows = cloneRows();
    matchingRows.candidates[0]!.row.NM_COLIGACAO = "UNIÃO CIDADÃ";
    matchingRows.candidates[0]!.row.NM_FEDERACAO = "FEDERAÇÃO DEMOCRÁTICA";
    matchingRows.coalitions[0]!.row.NM_FEDERACAO = "FEDERAÇÃO DEMOCRÁTICA";
    const matchingEvents: string[] = [];
    const matchingRepository = new FakeRepository(matchingEvents, "");
    const matching = await syncElection(
      new FakeClient(matchingRows),
      new FakeMediaStore(matchingEvents),
      matchingRepository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(matchingEvents) },
    );
    expect(matching.failed).toBe(false);
    expect(matchingRepository.snapshots[0].candidates[0]).toMatchObject({
      coalition: "UNIÃO CIDADÃ",
      federation: "FEDERAÇÃO DEMOCRÁTICA",
    });

    for (const field of ["NM_COLIGACAO", "NM_FEDERACAO"] as const) {
      const events: string[] = [];
      const rows = cloneRows();
      rows.candidates[0]!.row[field] = "DECLARADO PELA CANDIDATURA";
      rows.coalitions[0]!.row[field] = "DIVERGENTE NA COLIGAÇÃO";
      const report = await syncElection(
        new FakeClient(rows),
        new FakeMediaStore(events),
        new FakeRepository(events),
        { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
      );
      expect(report).toMatchObject({
        failed: true,
        errorCode: "CONFLICTING_COALITION_ENRICHMENT",
      });
    }
  });

  it("classifies campaign funding from all official category columns", async () => {
    const events: string[] = [];
    const rows = cloneRows();
    rows.campaignAccounts = [
      {
        entryKind: "campaignReceipts",
        row: {
          ANO_ELEICAO: "2026",
          SQ_CANDIDATO: candidateId,
          VR_RECEITA: "50,00",
          DS_ORIGEM_RECEITA: "Recursos de partido político",
          DS_FONTE_RECEITA: "Fundo Especial de Financiamento de Campanha",
        },
      },
      {
        entryKind: "campaignReceipts",
        row: {
          ANO_ELEICAO: "2026",
          SQ_CANDIDATO: candidateId,
          VR_RECEITA: "20,00",
          DS_ORIGEM_RECEITA: "Recursos próprios",
        },
      },
      {
        entryKind: "campaignReceipts",
        row: {
          ANO_ELEICAO: "2026",
          SQ_CANDIDATO: candidateId,
          VR_RECEITA: "10,00",
          DS_FONTE_RECEITA: "FEFC",
        },
      },
    ];
    const repository = new FakeRepository(events, "");

    const report = await syncElection(
      new FakeClient(rows),
      new FakeMediaStore(events),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report.failed).toBe(false);
    expect(repository.snapshots[0].campaignEntries.map((entry: any) => ({
      category: entry.category,
      valueCents: entry.valueCents,
    }))).toEqual([
      { category: "Recursos públicos", valueCents: 6_000n },
      { category: "Recursos próprios", valueCents: 2_000n },
    ]);
  });

  it("maps sentinels and unknown campaign origins to Não informado", async () => {
    const events: string[] = [];
    const rows = cloneRows();
    rows.campaignAccounts = [{
      entryKind: "campaignReceipts",
      row: {
        ANO_ELEICAO: "2026",
        SQ_CANDIDATO: candidateId,
        VR_RECEITA: "1,00",
        DS_ORIGEM_RECEITA: "#NULO",
        DS_FONTE_RECEITA: "#NE",
        DS_RECEITA: "Categoria futura não mapeada",
      },
    }];
    const repository = new FakeRepository(events, "");

    const report = await syncElection(
      new FakeClient(rows),
      new FakeMediaStore(events),
      repository,
      { electionYear: 2026, now: () => checkedAt, withLock: acquiredLock(events) },
    );

    expect(report.failed).toBe(false);
    expect(repository.snapshots[0].campaignEntries[0]).toMatchObject({ category: "Não informado" });
  });
});
