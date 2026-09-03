import { describe, expect, it } from "vitest";

import { BillRecord, MovementRecord } from "#/domain/legislative";

describe("canonical legislative records", () => {
  it("accepts a bill with official provenance", () => {
    const bill = BillRecord.parse({
      source: "camara",
      externalId: "2347064",
      officialCode: "PL 1106/2023",
      congressionalKey: "pl:1106:2023",
      officialTitle: "Projeto de Lei 1106/2023",
      officialSummary: "Altera a legislação trabalhista.",
      originHouse: "camara",
      currentHouse: "camara",
      statusCode: "100",
      statusLabel: "Aguardando parecer",
      officialUrl: "https://www.camara.leg.br/propostas-legislativas/2347064",
      presentedAt: "2023-03-13T00:00:00.000Z",
      checkedAt: "2026-09-03T18:00:00.000Z",
    });

    expect(bill.officialCode).toBe("PL 1106/2023");
    expect(bill.source).toBe("camara");
  });

  it("rejects a movement without provenance", () => {
    expect(() => MovementRecord.parse({ externalId: "move-1" })).toThrow();
  });
});
