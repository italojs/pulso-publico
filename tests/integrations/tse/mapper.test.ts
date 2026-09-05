import { readFile } from "node:fs/promises";

import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";

import {
  mapAssetRow,
  mapCampaignExpenseRow,
  mapCampaignReceiptRow,
  mapCandidateRow,
  mapSocialRow,
  moneyToCents,
  TseContractError,
} from "#/integrations/tse/mapper";

type TseRow = Record<string, string>;

const fixtureRoot = new URL("../../fixtures/tse/", import.meta.url);
const checkedAt = "2026-09-04T12:00:00.000Z";

async function readFixture(name: string): Promise<TseRow> {
  const csv = await readFile(new URL(name, fixtureRoot), "utf8");
  const [row] = parse(csv, { columns: true, delimiter: ";", skip_empty_lines: true }) as TseRow[];
  if (!row) throw new Error(`Fixture ${name} has no rows`);
  return row;
}

describe("TSE electoral mapping", () => {
  it("maps an official-shaped 2026 candidacy without retaining private identifiers", async () => {
    const row = await readFixture("candidates.csv");
    const candidate = mapCandidateRow({
      ...row,
      NR_CPF_CANDIDATO: "00000000000",
      DS_EMAIL: "ana@example.invalid",
      DS_ENDERECO: "Rua privada",
      NR_PROCESSO: "0000000-00.2026.6.00.0000",
    }, checkedAt);

    expect(candidate).toMatchObject({
      electionYear: 2026,
      externalId: "260001234567",
      fullName: "ANA CIDADÃ",
      office: "deputado_federal",
      region: "ES",
      seekingReelection: false,
      birthDate: "1980-01-02",
      socialName: null,
      federation: null,
      coalition: null,
      race: null,
      birthRegion: null,
    });
    expect(candidate.officialUrl).toBe(
      "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/SUDESTE/ES/20322002026/260001234567/2026/ES",
    );
    expect(candidate).not.toHaveProperty("cpf");
    expect(candidate).not.toHaveProperty("email");
    expect(candidate).not.toHaveProperty("address");
    expect(candidate).not.toHaveProperty("processNumber");
  });

  it("converts Brazilian currency to exact centavos without conflating zero and invalid input", () => {
    expect(moneyToCents("1.234,56")).toBe(123456n);
    expect(moneyToCents("0,00")).toBe(0n);
    expect(() => moneyToCents("1,234")).toThrow(TseContractError);
  });

  it("preserves an explicitly declared zero-value asset", async () => {
    const asset = mapAssetRow(await readFixture("candidate-assets.csv"));

    expect(asset).toMatchObject({
      candidateExternalId: "260001234567",
      valueCents: 0n,
      category: "Outros",
    });
  });

  it("maps receipt and expense entries with their distinct declared kinds", async () => {
    const receipt = mapCampaignReceiptRow(await readFixture("campaign-receipts.csv"));
    const expense = mapCampaignExpenseRow(await readFixture("campaign-expenses.csv"));

    expect(receipt).toMatchObject({
      candidateExternalId: "260001234567",
      kind: "receipt",
      valueCents: 123456n,
      category: "Recursos de pessoas físicas",
    });
    expect(expense).toMatchObject({
      candidateExternalId: "260001234567",
      kind: "expense",
      valueCents: 23450n,
      category: "Publicidade",
    });
  });

  it("keeps declared safe social links and drops unsafe protocols or credentials", () => {
    expect(mapSocialRow({
      AA_ELEICAO: "2026",
      SQ_CANDIDATO: "260001234567",
      DS_URL: "https://example.org/ana",
    })).toMatchObject({ url: "https://example.org/ana" });

    expect(mapSocialRow({
      AA_ELEICAO: "2026",
      SQ_CANDIDATO: "260001234567",
      DS_URL: "javascript:alert(1)",
    })).toBeNull();
    expect(mapSocialRow({
      AA_ELEICAO: "2026",
      SQ_CANDIDATO: "260001234567",
      DS_URL: "https://user:secret@example.org/ana",
    })).toBeNull();
  });

  it("rejects unknown required office labels", () => {
    try {
      mapCandidateRow({
        ANO_ELEICAO: "2026",
        SQ_CANDIDATO: "260001234567",
        NM_CANDIDATO: "ANA CIDADÃ",
        NM_URNA_CANDIDATO: "ANA",
        NR_CANDIDATO: "1234",
        DS_CARGO: "CARGO DESCONHECIDO",
        SG_UF: "ES",
        SG_PARTIDO: "ABC",
        NR_PARTIDO: "12",
        DS_SITUACAO_CANDIDATURA: "APTO",
      }, checkedAt);
      expect.unreachable("expected an unknown office to be rejected");
    } catch (error) {
      expect(error).toMatchObject({ code: "UNKNOWN_OFFICE" });
    }
  });

  it("rejects a declared nonpositive electoral round", () => {
    expect(() => mapCandidateRow({
      ANO_ELEICAO: "2026",
      SQ_CANDIDATO: "260001234567",
      NM_CANDIDATO: "ANA CIDADÃ",
      NM_URNA_CANDIDATO: "ANA",
      NR_CANDIDATO: "1234",
      NR_TURNO: "0",
      DS_CARGO: "DEPUTADO FEDERAL",
      SG_UF: "ES",
      SG_PARTIDO: "ABC",
      NR_PARTIDO: "12",
      DS_SITUACAO_CANDIDATURA: "APTO",
    }, checkedAt)).toThrow();
  });
});
