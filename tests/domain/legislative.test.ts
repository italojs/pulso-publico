import { describe, expect, it } from "vitest";

import { BillRecord, MovementRecord } from "#/domain/legislative";

describe("canonical legislative records", () => {
  const validBill = {
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
  } as const;

  it("accepts a bill with official provenance", () => {
    const bill = BillRecord.parse(validBill);

    expect(bill.officialCode).toBe("PL 1106/2023");
    expect(bill.source).toBe("camara");
  });

  it.each(["ATA_PRE", "R.C", "R.S"])("accepts the real official proposal type %s", (proposalType) => {
    expect(BillRecord.parse({ ...validBill, proposalType }).proposalType).toBe(proposalType);
  });

  it("degrades an unrecognized structured proposal type without rejecting the bill", () => {
    expect(BillRecord.parse({ ...validBill, proposalType: "TIPO/INTERNO" })).toMatchObject({
      officialCode: "PL 1106/2023",
      proposalType: null,
    });
  });

  it("rejects a movement without provenance", () => {
    expect(() => MovementRecord.parse({ externalId: "move-1" })).toThrow();
  });
});
