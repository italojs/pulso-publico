import { describe, expect, it } from "vitest";

import {
  candidateFilterRequestSchema,
  parseCandidateFilterInput,
  toCandidateFilterInput,
} from "#/server/candidates/filter-contract";
import type { CandidateFilters } from "#/server/candidates/read-models";

describe("candidate filter wire contract", () => {
  it("serializes money without bigint and restores exact centavos", () => {
    const filters: CandidateFilters = {
      assetMinCents: 0n,
      assetMaxCents: 12_345_678n,
      revenueMinCents: 1n,
      expenseMaxCents: 9_223_372_036_854_775_807n,
      page: 2,
    };

    const input = toCandidateFilterInput(filters);

    expect(input).toMatchObject({
      assetMin: "0",
      assetMax: "123456.78",
      revenueMin: "0.01",
      expenseMax: "92233720368547758.07",
    });
    expect(() => JSON.stringify({ filters: input })).not.toThrow();
    expect(parseCandidateFilterInput(input)).toEqual(filters);
  });

  it("round-trips signed balance bounds across the full PostgreSQL bigint range only", () => {
    const filters: CandidateFilters = {
      balanceMinCents: -9_223_372_036_854_775_808n,
      balanceMaxCents: -1n,
    };

    const input = toCandidateFilterInput(filters);

    expect(input).toEqual({
      balanceMin: "-92233720368547758.08",
      balanceMax: "-0.01",
    });
    expect(parseCandidateFilterInput(input)).toEqual(filters);
    expect(() => parseCandidateFilterInput({ balanceMin: "-92233720368547758.09" })).toThrow();
    expect(() => parseCandidateFilterInput({ balanceMin: "-1", balanceMax: "-2" })).toThrow();
    expect(() => parseCandidateFilterInput({ receiptMin: "-1" })).toThrow();
    expect(() => parseCandidateFilterInput({ revenueMin: "-1" })).toThrow();
    expect(() => parseCandidateFilterInput({ expenseMin: "-1" })).toThrow();
    expect(() => parseCandidateFilterInput({ assetMin: "-1" })).toThrow();
  });

  it("rejects controls and malformed Unicode in every free-text wire field", () => {
    for (const value of ["Ana\0Maria", "Ana\u001fMaria", "Ana\u007fMaria", "Ana\ud800Maria"]) {
      expect(() => parseCandidateFilterInput({ query: value })).toThrow();
      expect(() => parseCandidateFilterInput({ parties: [value] })).toThrow();
    }
  });

  it("accepts the complete strict input and rejects unknown fields", () => {
    const complete = {
      query: "Ana",
      electionYears: [2026],
      offices: ["senador"],
      regions: ["ES"],
      parties: ["ABC"],
      rounds: [1],
      statuses: ["APTO"],
      federations: ["Federação"],
      coalitions: ["Coligação"],
      ageMin: 30,
      ageMax: 60,
      genders: ["FEMININO"],
      races: ["PARDA"],
      educations: ["SUPERIOR COMPLETO"],
      occupations: ["PROFESSORA"],
      declaredAssets: "yes",
      assetMin: "0",
      assetMax: "1000.25",
      assetCountMin: 0,
      assetCountMax: 4,
      assetCategories: ["Apartamento"],
      revenueMin: "0.01",
      revenueMax: "2000",
      expenseMin: "0",
      expenseMax: "1500",
      balanceMin: "0",
      balanceMax: "500",
      fundingKinds: ["public", "own"],
      hasPhoto: true,
      hasSocial: false,
      hasGovernmentPlan: true,
      hasCertificates: false,
      hasFinance: true,
      hasConfirmedLawmaker: true,
      lawmakerHouses: ["camara"],
      activeMandate: true,
      topics: ["Trabalho"],
      followedOnly: true,
      allBrazil: true,
      order: "projects_desc",
      page: 1,
      pageSize: 20,
    } as const;

    expect(candidateFilterRequestSchema.safeParse({ filters: complete }).success).toBe(true);
    expect(candidateFilterRequestSchema.safeParse({ filters: complete, userId: "forged" }).success).toBe(false);
    expect(candidateFilterRequestSchema.safeParse({ filters: { ...complete, scoreMin: 8 } }).success).toBe(false);
  });

  it("rejects non-representable domain money instead of silently dropping it", () => {
    expect(() => toCandidateFilterInput({ assetMinCents: -1n })).toThrow();
    expect(() => toCandidateFilterInput({ assetMaxCents: 9_223_372_036_854_775_808n })).toThrow();
  });

  it("accepts followed-only only as true and omits a programmatic false value", () => {
    expect(candidateFilterRequestSchema.safeParse({ filters: { followedOnly: false } }).success).toBe(false);
    expect(toCandidateFilterInput({ followedOnly: false })).toEqual({});
    expect(toCandidateFilterInput({ followedOnly: true })).toEqual({ followedOnly: true });
  });

  it("preserves all-Brazil as non-filter request state and lets an explicit UF clear it", () => {
    expect(parseCandidateFilterInput({ allBrazil: true })).toEqual({ allBrazil: true });
    expect(toCandidateFilterInput({ allBrazil: true })).toEqual({ allBrazil: true });
    expect(parseCandidateFilterInput({ allBrazil: true, regions: ["ES"] })).toEqual({ regions: ["ES"] });
  });

  it.each([
    { assetMin: "-0.01" },
    { assetMin: "01" },
    { assetMin: "1.001" },
    { assetMin: "92233720368547758.08" },
    { revenueMin: "1e3" },
    { balanceMin: "1", balanceMax: "0" },
    { ageMin: 61, ageMax: 30 },
    { topics: Array.from({ length: 21 }, (_, index) => `Tema ${index}`) },
    { query: "x".repeat(201) },
    { page: 0 },
    { pageSize: 51 },
  ])("rejects malformed or reversed input %#", (filters) => {
    expect(() => parseCandidateFilterInput(filters)).toThrow();
  });
});
