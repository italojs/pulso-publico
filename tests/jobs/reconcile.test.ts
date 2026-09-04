import { describe, expect, it } from "vitest";

import {
  BillRecord,
  type Bill,
  type BillAuthor,
  type BillTopic,
  type IndividualVote,
  type Lawmaker,
  type LegislativeSourceAdapter,
  type Movement,
  type SyncPage,
  type VoteEvent,
} from "#/domain/legislative";
import {
  reconcileSource,
  type ReconcileRepository,
} from "#/jobs/reconcile";
import type { BillGraph } from "#/server/db/repositories";

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
  checkedAt: "2026-09-03T18:00:00.000Z",
});

const lawmaker: Lawmaker = {
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
  checkedAt: "2026-09-03T18:00:00.000Z",
};

class ReconcileAdapter implements LegislativeSourceAdapter {
  readonly source = "camara" as const;
  readonly windows: Array<{ since: Date; until: Date | undefined }> = [];
  failOnCall: number | null = null;

  async listBillsChangedSince(
    since: Date,
    _cursor?: string,
    until?: Date,
  ): Promise<SyncPage<Bill>> {
    this.windows.push({ since, until });
    if (this.windows.length === this.failOnCall) throw new Error("source unavailable");
    return {
      items: this.windows.length === 1 ? [bill] : [],
      nextCursor: null,
    };
  }

  async getBill() { return bill; }
  async listBillAuthors(): Promise<BillAuthor[]> { return []; }
  async listBillTopics(): Promise<BillTopic[]> { return []; }
  async listBillMovements(): Promise<Movement[]> { return []; }
  async listBillVoteEvents(): Promise<VoteEvent[]> { return []; }
  async listIndividualVotes(): Promise<IndividualVote[]> { return []; }
  async listActiveLawmakers(): Promise<SyncPage<Lawmaker>> {
    return { items: [lawmaker], nextCursor: null };
  }
  async getLawmaker() { return lawmaker; }
}

class ReconcileStore implements ReconcileRepository {
  readonly localBills = new Set(["omitted-local-bill"]);
  readonly events: string[] = [];
  readonly lawmakers = new Set<string>();

  async upsertLawmakers(items: Lawmaker[]) {
    for (const item of items) this.lawmakers.add(item.externalId);
    this.events.push(`lawmakers:${items.length}`);
  }

  async findMissingLawmakerExternalIds(
    _source: "camara" | "senado",
    externalIds: readonly string[],
  ) {
    return externalIds.filter((externalId) => !this.lawmakers.has(externalId));
  }

  async upsertBillGraph(graph: BillGraph) {
    this.localBills.add(graph.bill.externalId);
    this.events.push(`upsert:${graph.bill.externalId}`);
  }

  async markSourceSuccess() {
    this.events.push("success");
  }

  async markSourceFailure() {
    this.events.push("failure");
  }
}

describe("reconcileSource", () => {
  it("refreshes returned bills without deleting omitted local records", async () => {
    const adapter = new ReconcileAdapter();
    const repository = new ReconcileStore();

    const report = await reconcileSource(adapter, repository, {
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-02T23:59:59.999Z"),
    });

    expect(adapter.windows).toEqual([
      {
        since: new Date("2026-09-01T00:00:00.000Z"),
        until: new Date("2026-09-01T23:59:59.999Z"),
      },
      {
        since: new Date("2026-09-02T00:00:00.000Z"),
        until: new Date("2026-09-02T23:59:59.999Z"),
      },
    ]);
    expect(repository.localBills).toEqual(
      new Set(["omitted-local-bill", "2351249"]),
    );
    expect(repository.events[0]).toBe("lawmakers:1");
    expect(repository.events.at(-1)).toBe("success");
    expect(report).toMatchObject({ lawmakers: 1, bills: 1, days: 2, failed: false });
  });

  it("does not mark success when a later reconciliation day fails", async () => {
    const adapter = new ReconcileAdapter();
    adapter.failOnCall = 2;
    const repository = new ReconcileStore();

    const report = await reconcileSource(adapter, repository, {
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-02T23:59:59.999Z"),
    });

    expect(repository.events).not.toContain("success");
    expect(repository.events.at(-1)).toBe("failure");
    expect(report.failed).toBe(true);
  });
});
