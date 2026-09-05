import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import type { TseMediaEntry, TseRegion } from "#/integrations/tse/client";
import { TseContractError } from "#/integrations/tse/mapper";
import { syncElection } from "#/jobs/sync-election";

type Resource = "candidates" | "complements" | "assets" | "coalitions" | "social" | "campaignAccounts";
type EntryKind = Resource | "campaignReceipts" | "campaignContractedExpenses" | "campaignPaidExpenses";

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
        ANO_ELEICAO: "2026",
        SQ_CANDIDATO: candidateId,
        VR_PAGTO: "35,00",
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

class FakeClient {
  readonly calls: string[] = [];
  readonly rows: ReturnType<typeof cloneRows>;
  readonly failure: { resource: Resource; error: Error } | undefined;

  constructor(
    rows = cloneRows(),
    failure?: { resource: Resource; error: Error },
  ) {
    this.rows = rows;
    this.failure = failure;
  }

  resourceUrl(resource: Resource) {
    return `https://cdn.tse.jus.br/${resource}.zip`;
  }

  async *streamRowEntries(resource: Resource) {
    this.calls.push(`rows:${resource}`);
    if (this.failure?.resource === resource) throw this.failure.error;
    for (const entry of this.rows[resource]) {
      yield {
        ...entry,
        sourceArchiveUrl: this.resourceUrl(resource),
      };
    }
  }

  async *streamRegionalMedia(kind: TseMediaEntry["kind"], region: TseRegion) {
    this.calls.push(`media:${kind}:${region}`);
    if (region !== "ES") return;
    const extension = kind === "photos" ? "jpg" : "pdf";
    yield {
      kind,
      region,
      candidateExternalId: candidateId,
      originalFilename: `${kind}_${candidateId}.${extension}`,
      mimeType: kind === "photos" ? "image/jpeg" : "application/pdf",
      sourceArchiveUrl: `https://cdn.tse.jus.br/${kind}_${region}.zip`,
      content: Readable.from([kind]),
    } as TseMediaEntry;
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
  snapshots: any[] = [];
  failures: any[] = [];
  pending: any[] = [];

  constructor(
    events: string[],
    previousRun = "previous-generation",
    persistError?: Error,
  ) {
    this.events = events;
    this.previousRun = previousRun;
    this.persistError = persistError;
  }

  async findLatestSuccessfulSyncRun() {
    return this.previousRun;
  }

  async persistSnapshot(snapshot: unknown) {
    if (this.persistError) {
      this.events.push("persist-failed");
      throw this.persistError;
    }
    this.snapshots.push(snapshot);
    this.events.push("persist");
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
});
