import { describe, expect, it } from "vitest";

import type {
  Lawmaker,
  LegislativeSourceAdapter,
} from "#/domain/legislative";
import { ensureReferencedLawmakers } from "#/server/legislative/persist-bill-graph";

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
