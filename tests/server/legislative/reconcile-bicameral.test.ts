import { describe, expect, it, vi } from "vitest";

import type { Bill, LegislativeSourceAdapter } from "#/domain/legislative";
import { ensureBicameralPartner } from "#/server/legislative/reconcile-bicameral";

const current = {
  source: "senado",
  externalId: "9056435",
  proposalType: "PEC",
  proposalNumber: 221,
  proposalYear: 2019,
  congressionalKey: "pec:221:2019",
  originHouse: "camara",
  currentHouse: "senado",
} as const;

const partner = {
  source: "camara",
  externalId: "2233802",
  officialCode: "PEC 221/2019",
  proposalType: "PEC",
  proposalNumber: 221,
  proposalYear: 2019,
  congressionalKey: "pec:221:2019",
  officialTitle: "PEC 221/2019",
  officialSummary: "Altera a jornada de trabalho.",
  originHouse: "camara",
  currentHouse: "camara",
  statusCode: null,
  statusLabel: "Remetida ao Senado Federal",
  officialUrl: "https://www.camara.leg.br/propostas-legislativas/2233802",
  presentedAt: "2019-10-15T22:12:00.000Z",
  checkedAt: "2026-09-06T20:00:00.000Z",
} satisfies Bill;

function dependencies(matches: Bill[]) {
  return {
    repository: {
      findBillByOfficialIdentity: vi.fn(async () => null),
      upsertBillGraph: vi.fn(async () => undefined),
    },
    adapters: {
      camara: {
        source: "camara",
        findBillsByOfficialIdentity: vi.fn(async () => matches),
      } as unknown as LegislativeSourceAdapter,
      senado: { source: "senado" } as LegislativeSourceAdapter,
    },
    hydrate: vi.fn(async () => ({ status: "complete" as const })),
  };
}

describe("ensureBicameralPartner", () => {
  it("imports and hydrates one exact partner from the official origin house", async () => {
    const deps = dependencies([partner]);

    await expect(ensureBicameralPartner(current, deps)).resolves.toEqual({
      source: "camara",
      externalId: "2233802",
    });
    expect(deps.repository.upsertBillGraph).toHaveBeenCalledWith({
      bill: partner,
      authors: [],
      topics: [],
      movements: [],
      voteEvents: [],
      individualVotes: [],
    });
    expect(deps.hydrate).toHaveBeenCalledWith("camara", "2233802");
  });

  it("does not persist an ambiguous official result", async () => {
    const deps = dependencies([partner, { ...partner, externalId: "another" }]);

    await expect(ensureBicameralPartner(current, deps)).resolves.toBeNull();
    expect(deps.repository.upsertBillGraph).not.toHaveBeenCalled();
    expect(deps.hydrate).not.toHaveBeenCalled();
  });

  it("does not infer a partner without a complete official identity", async () => {
    const deps = dependencies([partner]);

    await expect(ensureBicameralPartner({ ...current, proposalYear: null }, deps))
      .resolves.toBeNull();
    expect(deps.adapters.camara.findBillsByOfficialIdentity).not.toHaveBeenCalled();
  });
});
