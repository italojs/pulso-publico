import { describe, expect, it } from "vitest";

import type {
  Lawmaker,
  LegislativeSourceAdapter,
  VoteEvent,
} from "#/domain/legislative";
import billFixture from "../../fixtures/camara/proposicoes.json" with { type: "json" };
import { mapCamaraBill } from "#/integrations/camara/mapper";
import { ensureReferencedLawmakers, loadBillGraph } from "#/server/legislative/persist-bill-graph";

describe("loadBillGraph", () => {
  it("recognizes published individual votes as nominal without fetching secret votes", async () => {
    const checkedAt = "2026-09-15T15:00:00.000Z";
    const requestedEvents: string[] = [];
    const event: VoteEvent = {
      source: "camara", externalId: "nominal", billExternalId: "2351249",
      occurredAt: checkedAt, house: "camara", description: "Aprovado o texto.",
      result: "aprovada", isNominal: false, isSecret: false,
      officialUrl: "https://dadosabertos.camara.leg.br/api/v2/votacoes/nominal", checkedAt,
    };
    const adapter: LegislativeSourceAdapter = {
      source: "camara",
      async listBillsChangedSince() { return { items: [], nextCursor: null }; },
      async listActiveLawmakers() { return { items: [], nextCursor: null }; },
      async getLawmaker() { throw new Error("No lawmaker should be fetched by the graph loader"); },
      async getBill() { return mapCamaraBill(billFixture.dados[0], new Date(checkedAt)); },
      async listBillAuthors() { return []; },
      async listBillTopics() { return []; },
      async listBillMovements() { return []; },
      async listBillVoteEvents() {
        return [event,
          { ...event, externalId: "symbolic" },
          { ...event, externalId: "secret", isSecret: true },
          { ...event, externalId: "published-nominal", isNominal: true },
          { ...event, externalId: "inconsistent-secret", isSecret: true, isNominal: true },
        ];
      },
      async listIndividualVotes(externalId: string) {
        requestedEvents.push(externalId);
        return externalId === "nominal" ? [{
          source: "camara" as const, externalId: "nominal:1", voteEventExternalId: "nominal",
          lawmakerExternalId: "1", choice: "sim" as const, rawChoice: "Sim",
          officialUrl: "https://dadosabertos.camara.leg.br/api/v2/votacoes/nominal/votos", checkedAt,
        }] : [];
      },
    };

    const graph = await loadBillGraph(adapter, "2351249");

    expect(graph.voteEvents.map(({ externalId, isNominal, isSecret }) => ({ externalId, isNominal, isSecret })))
      .toEqual([
        { externalId: "nominal", isNominal: true, isSecret: false },
        { externalId: "symbolic", isNominal: false, isSecret: false },
        { externalId: "secret", isNominal: false, isSecret: true },
        { externalId: "published-nominal", isNominal: true, isSecret: false },
        { externalId: "inconsistent-secret", isNominal: false, isSecret: true },
      ]);
    expect(requestedEvents).toEqual(["nominal", "symbolic", "published-nominal"]);
    expect(graph.individualVotes).toHaveLength(1);
  });
});

describe("ensureReferencedLawmakers", () => {
  it("loads and persists only unique lawmakers missing from the database", async () => {
    const fetched: string[] = [];
    const persisted: Lawmaker[] = [];
    const adapter = {
      source: "camara",
      async getLawmaker(externalId: string) {
        fetched.push(externalId);
        return {
          source: "camara",
          externalId,
          name: `Pessoa ${externalId}`,
          electoralName: `Pessoa ${externalId}`,
          role: "deputado_federal",
          party: "ABC",
          region: "SP",
          photoUrl: null,
          active: true,
          officialUrl: `https://example.test/lawmakers/${externalId}`,
          checkedAt: "2026-09-09T12:00:00.000Z",
        } satisfies Lawmaker;
      },
    } as LegislativeSourceAdapter;
    const repository = {
      async findMissingLawmakerExternalIds() {
        return ["2", "3"];
      },
      async upsertLawmakers(items: Lawmaker[]) {
        persisted.push(...items);
      },
      async upsertBillGraph() {},
    };

    await ensureReferencedLawmakers(adapter, repository, ["1", "2", "2", "3"]);

    expect(fetched).toEqual(["2", "3"]);
    expect(persisted.map((item) => item.externalId)).toEqual(["2", "3"]);
  });
});
