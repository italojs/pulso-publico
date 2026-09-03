import { describe, expect, it } from "vitest";

import {
  BillAuthorRecord,
  BillRecord,
  IndividualVoteRecord,
  LawmakerRecord,
  MovementRecord,
  VoteEventRecord,
  type Bill,
  type BillAuthor,
  type BillTopic,
  type IndividualVote,
  type Lawmaker,
  type LegislativeSourceAdapter,
  type LegislativeSourceName,
  type Movement,
  type SyncPage,
  type VoteEvent,
} from "#/domain/legislative";
import {
  syncSource,
  type SyncRepository,
} from "#/jobs/sync-source";
import type { BillGraph } from "#/server/db/repositories";
import { OfficialSourceError } from "#/server/http/retrying-fetch";

const checkedAt = "2026-09-03T18:00:00.000Z";
const bill = BillRecord.parse({
  source: "camara",
  externalId: "2351249",
  officialCode: "PL 1106/2023",
  congressionalKey: "pl:1106:2023",
  officialTitle: "Projeto de Lei 1106/2023",
  officialSummary: "Reconhece a robótica como esporte.",
  originHouse: "camara",
  currentHouse: "senado",
  statusCode: "926",
  statusLabel: "Aguardando Apreciação pelo Senado Federal",
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
  externalId: "movement-1",
  billExternalId: "2351249",
  occurredAt: "2026-07-01T03:00:00.000Z",
  sequence: 1,
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
  externalId: "vote-1",
  billExternalId: "2351249",
  occurredAt: "2026-06-30T18:00:00.000Z",
  house: "camara",
  description: "Votação nominal.",
  result: "aprovada",
  isNominal: true,
  isSecret: false,
  officialUrl: "https://dadosabertos.camara.leg.br/api/v2/votacoes/vote-1",
  checkedAt,
});
const individualVote = IndividualVoteRecord.parse({
  source: "camara",
  externalId: "vote-1:204485",
  voteEventExternalId: "vote-1",
  lawmakerExternalId: "204485",
  choice: "sim",
  rawChoice: "Sim",
  officialUrl: "https://dadosabertos.camara.leg.br/api/v2/votacoes/vote-1/votos",
  checkedAt,
});

class FakeAdapter implements LegislativeSourceAdapter {
  readonly source: LegislativeSourceName;
  receivedSince: Date | null = null;
  movementCalls = 0;
  individualCalls = 0;
  failListing = false;

  constructor(source: LegislativeSourceName = "camara") {
    this.source = source;
  }

  async listBillsChangedSince(since: Date): Promise<SyncPage<Bill>> {
    this.receivedSince = since;
    if (this.failListing) {
      throw new OfficialSourceError("temporary failure", "https://source.test", 503, true);
    }
    return { items: [this.billForSource()], nextCursor: null };
  }

  async getBill(): Promise<Bill> {
    return this.billForSource();
  }

  async listBillAuthors(): Promise<BillAuthor[]> {
    return [author];
  }

  async listBillTopics(): Promise<BillTopic[]> {
    return [];
  }

  async listBillMovements(): Promise<Movement[]> {
    this.movementCalls += 1;
    return [movement];
  }

  async listBillVoteEvents(): Promise<VoteEvent[]> {
    return [voteEvent];
  }

  async listIndividualVotes(): Promise<IndividualVote[]> {
    this.individualCalls += 1;
    return [individualVote];
  }

  async listActiveLawmakers(): Promise<SyncPage<Lawmaker>> {
    return { items: [this.lawmakerForSource()], nextCursor: null };
  }

  private billForSource(): Bill {
    if (this.source === "camara") return bill;
    return {
      ...bill,
      source: "senado",
      originHouse: "senado",
      currentHouse: "senado",
      officialUrl: "https://www25.senado.leg.br/web/atividade/materias/-/materia/172003",
    };
  }

  private lawmakerForSource(): Lawmaker {
    if (this.source === "camara") return lawmaker;
    return {
      ...lawmaker,
      source: "senado",
      role: "senador",
      officialUrl: "https://www25.senado.leg.br/web/senadores/senador/-/perfil/5672",
    };
  }
}

class FakeRepository implements SyncRepository {
  checkpoint: Date | null = null;
  savedCheckpoint: Date | null = null;
  graphs: BillGraph[] = [];
  lawmakers: Lawmaker[] = [];
  successAt: Date | null = null;
  failure: { checkedAt: Date; code: string } | null = null;

  async upsertBillGraph(graph: BillGraph) {
    this.graphs.push(graph);
  }

  async upsertLawmakers(items: Lawmaker[]) {
    this.lawmakers.push(...items);
  }

  async getCheckpoint() {
    return this.checkpoint;
  }

  async saveCheckpoint(_source: LegislativeSourceName, value: Date) {
    this.savedCheckpoint = value;
  }

  async markSourceSuccess(_source: LegislativeSourceName, checkedAt: Date) {
    this.successAt = checkedAt;
  }

  async markSourceFailure(
    _source: LegislativeSourceName,
    checkedAt: Date,
    code: string,
  ) {
    this.failure = { checkedAt, code };
  }
}

describe("syncSource", () => {
  const now = new Date("2026-09-03T18:00:00.000Z");

  it("uses the Câmara bulk bootstrap for the initial 36-month summary load", async () => {
    const adapter = new FakeAdapter();
    const repository = new FakeRepository();
    const received = { since: null as Date | null };
    const bulkAdapter = Object.assign(adapter, {
      async *streamInitialBills(since: Date, _until: Date) {
        received.since = since;
        yield bill;
        yield { ...bill, externalId: "2351250" };
      },
    });

    const report = await syncSource(bulkAdapter, repository, now, {
      initialHistoryMonths: 36,
    });

    expect(report).toMatchObject({ source: "camara", bills: 2, failed: false });
    expect(received.since?.toISOString()).toBe("2023-09-03T18:00:00.000Z");
    expect(adapter.receivedSince).toBeNull();
    expect(adapter.movementCalls).toBe(0);
    expect(repository.graphs.every((item) => item.movements.length === 0)).toBe(true);
    expect(repository.savedCheckpoint).toEqual(now);
  });

  it("falls back to paginated source search when no bulk bootstrap exists", async () => {
    const adapter = new FakeAdapter("senado");
    const repository = new FakeRepository();

    await syncSource(adapter, repository, now, { initialHistoryMonths: 36 });

    expect(adapter.receivedSince?.toISOString()).toBe("2023-09-03T18:00:00.000Z");
    expect(adapter.movementCalls).toBe(0);
  });

  it("hydrates changed bills after the five-minute overlap window", async () => {
    const adapter = new FakeAdapter();
    const repository = new FakeRepository();
    repository.checkpoint = new Date("2026-09-03T17:30:00.000Z");

    const report = await syncSource(adapter, repository, now, {
      initialHistoryMonths: 36,
    });

    expect(adapter.receivedSince?.toISOString()).toBe("2026-09-03T17:25:00.000Z");
    expect(adapter.movementCalls).toBe(1);
    expect(adapter.individualCalls).toBe(1);
    expect(repository.graphs[0]).toMatchObject({
      authors: [author],
      movements: [movement],
      voteEvents: [voteEvent],
      individualVotes: [individualVote],
    });
    expect(report).toMatchObject({
      bills: 1,
      authors: 1,
      movements: 1,
      voteEvents: 1,
      individualVotes: 1,
      failed: false,
    });
  });

  it("does not advance the checkpoint when an official source fails", async () => {
    const adapter = new FakeAdapter();
    adapter.failListing = true;
    const repository = new FakeRepository();
    repository.checkpoint = new Date("2026-09-03T17:30:00.000Z");

    const report = await syncSource(adapter, repository, now, {
      initialHistoryMonths: 36,
    });

    expect(report.failed).toBe(true);
    expect(repository.savedCheckpoint).toBeNull();
    expect(repository.failure).toMatchObject({ code: "HTTP_503" });
  });
});
