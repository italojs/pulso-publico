import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { UserRepository } from "#/auth/user-repository";
import {
  billAuthors,
  bills,
  billTopics,
  candidateAssets,
  candidateCampaignTotals,
  candidateDocuments,
  candidateGovernmentPlans,
  candidateLawmakerLinks,
  candidateSocialLinks,
  electoralCandidates,
  electoralSyncRuns,
  followedCandidates,
  individualVotes,
  lawmakers,
  users,
  voteEvents,
} from "#/server/db/schema";
import {
  countCandidates,
  getCandidateDetail,
  listCandidateFilterOptions,
  listCandidates,
} from "#/server/candidates/queries";
import { POST as countPost } from "../../../app/api/candidates/filter-count/route.ts";
import {
  migrateTestDatabase,
  testDb,
  testSql,
  truncateLegislativeTables,
} from "../../setup-database.ts";

const checkedAt = new Date("2026-09-05T12:00:00.000Z");
const extractedAt = new Date("2026-09-05T11:00:00.000Z");
const origin = "http://app.test";

function candidate(externalId: string, overrides: Partial<typeof electoralCandidates.$inferInsert>) {
  return {
    electionYear: 2026,
    externalId,
    snapshotRunId: "current-2026",
    fullName: `Pessoa ${externalId}`,
    ballotName: `Candidatura ${externalId}`,
    socialName: null,
    number: Number(externalId),
    office: "deputado_federal" as const,
    round: 1,
    region: "ES",
    electoralUnit: "ESPÍRITO SANTO",
    status: "APTO",
    statusDetail: null,
    partyAcronym: "ABC",
    partyNumber: 10,
    partyName: "Partido ABC",
    federation: "Federação A",
    coalition: "Coligação A",
    seekingReelection: false,
    birthDate: "1980-01-01",
    ageAtInauguration: 46,
    gender: "FEMININO",
    race: "PARDA",
    education: "SUPERIOR COMPLETO",
    occupation: "PROFESSORA",
    maritalStatus: "SOLTEIRA",
    nationality: "BRASILEIRA NATA",
    birthRegion: "ES",
    birthCity: "VITÓRIA",
    officialUrl: `https://divulgacandcontas.tse.jus.br/candidato/${externalId}`,
    sourceArchiveUrl: "https://cdn.tse.jus.br/candidates.zip",
    sourceExtractedAt: extractedAt,
    checkedAt,
    ...overrides,
  };
}

async function seedCandidates() {
  await testDb.insert(electoralSyncRuns).values([
    {
      syncRunId: "stale-2026",
      electionYear: 2026,
      status: "successful",
      startedAt: new Date("2026-08-01T10:00:00.000Z"),
      completedAt: new Date("2026-08-01T11:00:00.000Z"),
      extractedAt: new Date("2026-08-01T09:00:00.000Z"),
    },
    {
      syncRunId: "current-2026",
      electionYear: 2026,
      status: "successful",
      startedAt: checkedAt,
      completedAt: checkedAt,
      extractedAt,
    },
  ]);

  const [stale, ana, bia, caio] = await testDb.insert(electoralCandidates).values([
    candidate("9999", {
      snapshotRunId: "stale-2026",
      ballotName: "Candidatura Antiga",
      region: "RR",
      status: "INDEFERIDO ANTIGO",
      partyAcronym: "OLD",
      partyName: "Partido Antigo",
      occupation: "OCUPAÇÃO ANTIGA",
    }),
    candidate("1010", {
      ballotName: "Ana Cidadã",
      fullName: "Ana Maria Cidadã",
      number: 1010,
      photoStorageKey: "current-2026/photos/1010/foto.jpg",
    }),
    candidate("2020", {
      ballotName: "Bia do Povo",
      fullName: "Beatriz Popular",
      socialName: "Bia",
      number: 2020,
      office: "senador",
      region: "SP",
      electoralUnit: "SÃO PAULO",
      status: "APTO COM RECURSO",
      partyAcronym: "XYZ",
      partyNumber: 20,
      partyName: "Partido XYZ",
      federation: null,
      coalition: null,
      ageAtInauguration: 30,
      gender: "MASCULINO",
      race: "BRANCA",
      education: "ENSINO MÉDIO COMPLETO",
      occupation: "ENGENHEIRA",
      checkedAt: new Date("2026-09-04T12:00:00.000Z"),
    }),
    candidate("3030", {
      ballotName: "Caio Livre",
      fullName: "Caio Livre",
      number: 3030,
      office: "senador",
      round: 2,
      ageAtInauguration: 60,
      gender: "MASCULINO",
      race: "PRETA",
      education: "DOUTORADO",
      occupation: "ADVOGADO",
      federation: "Federação C",
      coalition: "Coligação C",
      checkedAt: new Date("2026-09-03T12:00:00.000Z"),
    }),
  ]).returning();
  if (!stale || !ana || !bia || !caio) throw new Error("candidate fixture failed");

  await testDb.insert(candidateAssets).values([
    { candidateId: stale.id, category: "Antigo", valueCents: 999_999n, sourceExtractedAt: extractedAt, checkedAt },
    { candidateId: ana.id, category: "Imóvel", description: "Apartamento", valueCents: 10_000n, sourceExtractedAt: extractedAt, checkedAt },
    { candidateId: ana.id, category: "Veículo", description: "Bicicleta", valueCents: 0n, sourceExtractedAt: extractedAt, checkedAt },
    { candidateId: caio.id, category: "Outros", description: "Bem sem valor", valueCents: 0n, sourceExtractedAt: extractedAt, checkedAt },
  ]);
  await testDb.insert(candidateCampaignTotals).values([
    {
      candidateId: ana.id,
      revenueCents: 50_000n,
      expenseCents: 20_000n,
      balanceCents: 30_000n,
      revenueByCategory: { "Recursos públicos": "40000", "Recursos privados": "10000" },
      expenseByCategory: { Publicidade: "20000" },
      sourceExtractedAt: extractedAt,
      checkedAt,
    },
    {
      candidateId: bia.id,
      revenueCents: 0n,
      expenseCents: 0n,
      balanceCents: 0n,
      revenueByCategory: {},
      expenseByCategory: {},
      sourceExtractedAt: extractedAt,
      checkedAt,
    },
  ]);
  await testDb.insert(candidateSocialLinks).values({
    candidateId: ana.id,
    label: "Instagram",
    url: "https://example.test/ana",
    sourceExtractedAt: extractedAt,
    checkedAt,
  });
  await testDb.insert(candidateGovernmentPlans).values({
    candidateId: ana.id,
    officialUrl: "https://cdn.tse.jus.br/plano-ana.pdf",
    storageKey: "current-2026/plans/1010/plano.pdf",
    originalFilename: "plano.pdf",
    mimeType: "application/pdf",
    checkedAt,
  });
  await testDb.insert(candidateDocuments).values({
    candidateId: ana.id,
    label: "Certidão criminal publicada pelo TSE",
    officialUrl: "https://cdn.tse.jus.br/certidao-ana.pdf",
    storageKey: "current-2026/certificates/1010/certidao.pdf",
    originalFilename: "certidao.pdf",
    mimeType: "application/pdf",
    checkedAt,
  });

  const [camara, senado, pending] = await testDb.insert(lawmakers).values([
    {
      source: "camara",
      externalId: "law-ana",
      name: "Ana Maria Cidadã",
      electoralName: "Ana Cidadã",
      role: "deputado_federal",
      party: "ABC",
      region: "ES",
      active: true,
      officialUrl: "https://www.camara.leg.br/deputados/law-ana",
      checkedAt,
    },
    {
      source: "senado",
      externalId: "law-caio",
      name: "Caio Livre",
      electoralName: "Caio Livre",
      role: "senador",
      party: "ABC",
      region: "ES",
      active: false,
      officialUrl: "https://www25.senado.leg.br/web/senadores/senador/-/perfil/law-caio",
      checkedAt,
    },
    {
      source: "senado",
      externalId: "law-pending",
      name: "Beatriz Popular",
      electoralName: "Bia do Povo",
      role: "senador",
      party: "XYZ",
      region: "SP",
      active: true,
      officialUrl: "https://www25.senado.leg.br/web/senadores/senador/-/perfil/law-pending",
      checkedAt,
    },
  ]).returning();
  if (!camara || !senado || !pending) throw new Error("lawmaker fixture failed");

  await testDb.insert(candidateLawmakerLinks).values([
    { candidateId: ana.id, lawmakerId: camara.id, status: "confirmed", matchMethod: "operator_review" },
    { candidateId: caio.id, lawmakerId: senado.id, status: "confirmed", matchMethod: "operator_review" },
    { candidateId: bia.id, lawmakerId: pending.id, status: "pending", matchMethod: "exact_name_region" },
    { candidateId: bia.id, lawmakerId: senado.id, status: "rejected", matchMethod: "operator_review" },
  ]);

  const [anaBill1, anaBill2, caioBill, pendingBill] = await testDb.insert(bills).values([
    {
      source: "camara", externalId: "ana-1", officialCode: "PL 1/2026", officialTitle: "Trabalho digno",
      officialSummary: "", originHouse: "camara", statusLabel: "Em análise", officialUrl: "https://camara.test/ana-1", checkedAt,
    },
    {
      source: "camara", externalId: "ana-2", officialCode: "PL 2/2026", officialTitle: "Saúde pública",
      officialSummary: "", originHouse: "camara", statusLabel: "Em análise", officialUrl: "https://camara.test/ana-2", checkedAt,
    },
    {
      source: "senado", externalId: "caio-1", officialCode: "PL 3/2026", officialTitle: "Educação",
      officialSummary: "", originHouse: "senado", statusLabel: "Em análise", officialUrl: "https://senado.test/caio-1", checkedAt,
    },
    {
      source: "senado", externalId: "pending-1", officialCode: "PL 4/2026", officialTitle: "Tema pendente",
      officialSummary: "", originHouse: "senado", statusLabel: "Em análise", officialUrl: "https://senado.test/pending-1", checkedAt,
    },
  ]).returning();
  if (!anaBill1 || !anaBill2 || !caioBill || !pendingBill) throw new Error("bill fixture failed");

  await testDb.insert(billAuthors).values([
    { source: "camara", externalId: "author-a1", billId: anaBill1.id, lawmakerId: camara.id, officialName: "Ana", authorKind: "deputada", isPrimary: true, officialUrl: "https://camara.test/a1", checkedAt },
    { source: "camara", externalId: "author-a2", billId: anaBill2.id, lawmakerId: camara.id, officialName: "Ana", authorKind: "deputada", isPrimary: true, officialUrl: "https://camara.test/a2", checkedAt },
    { source: "senado", externalId: "author-c1", billId: caioBill.id, lawmakerId: senado.id, officialName: "Caio", authorKind: "senador", isPrimary: true, officialUrl: "https://senado.test/c1", checkedAt },
    { source: "senado", externalId: "author-p1", billId: pendingBill.id, lawmakerId: pending.id, officialName: "Bia", authorKind: "senadora", isPrimary: true, officialUrl: "https://senado.test/p1", checkedAt },
  ]);
  await testDb.insert(billTopics).values([
    { source: "camara", externalId: "topic-a1", billId: anaBill1.id, label: "Trabalho", officialUrl: "https://camara.test/t-a1", checkedAt },
    { source: "camara", externalId: "topic-a2", billId: anaBill1.id, label: "Direitos humanos", officialUrl: "https://camara.test/t-a2", checkedAt },
    { source: "camara", externalId: "topic-a3", billId: anaBill2.id, label: "Saúde", officialUrl: "https://camara.test/t-a3", checkedAt },
    { source: "senado", externalId: "topic-c1", billId: caioBill.id, label: "Educação", officialUrl: "https://senado.test/t-c1", checkedAt },
    { source: "senado", externalId: "topic-p1", billId: pendingBill.id, label: "Tema pendente", officialUrl: "https://senado.test/t-p1", checkedAt },
  ]);

  const [anaEvent1, anaEvent2, caioEvent, pendingEvent] = await testDb.insert(voteEvents).values([
    { source: "camara", externalId: "vote-a1", billId: anaBill1.id, occurredAt: checkedAt, house: "camara", description: "Votação A1", isNominal: true, isSecret: false, officialUrl: "https://camara.test/v-a1", checkedAt },
    { source: "camara", externalId: "vote-a2", billId: anaBill2.id, occurredAt: checkedAt, house: "camara", description: "Votação A2", isNominal: true, isSecret: false, officialUrl: "https://camara.test/v-a2", checkedAt },
    { source: "senado", externalId: "vote-c1", billId: caioBill.id, occurredAt: checkedAt, house: "senado", description: "Votação C1", isNominal: true, isSecret: false, officialUrl: "https://senado.test/v-c1", checkedAt },
    { source: "senado", externalId: "vote-p1", billId: pendingBill.id, occurredAt: checkedAt, house: "senado", description: "Votação P1", isNominal: true, isSecret: false, officialUrl: "https://senado.test/v-p1", checkedAt },
  ]).returning();
  if (!anaEvent1 || !anaEvent2 || !caioEvent || !pendingEvent) throw new Error("vote fixture failed");
  await testDb.insert(individualVotes).values([
    { source: "camara", externalId: "individual-a1", voteEventId: anaEvent1.id, lawmakerId: camara.id, choice: "sim", rawChoice: "Sim", officialUrl: "https://camara.test/iv-a1", checkedAt },
    { source: "camara", externalId: "individual-a2", voteEventId: anaEvent2.id, lawmakerId: camara.id, choice: "nao", rawChoice: "Não", officialUrl: "https://camara.test/iv-a2", checkedAt },
    { source: "senado", externalId: "individual-c1", voteEventId: caioEvent.id, lawmakerId: senado.id, choice: "sim", rawChoice: "Sim", officialUrl: "https://senado.test/iv-c1", checkedAt },
    { source: "senado", externalId: "individual-p1", voteEventId: pendingEvent.id, lawmakerId: pending.id, choice: "sim", rawChoice: "Sim", officialUrl: "https://senado.test/iv-p1", checkedAt },
  ]);

  const [user] = await testDb.insert(users).values({ email: "candidate-filters@example.test", passwordHash: "hash" }).returning();
  if (!user) throw new Error("user fixture failed");
  await testDb.insert(followedCandidates).values({ userId: user.id, candidateId: ana.id });
  const session = await new UserRepository(testDb).createSession(user.id);
  return { stale, ana, bia, caio, user, session };
}

let seeded: Awaited<ReturnType<typeof seedCandidates>>;

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await truncateLegislativeTables();
  seeded = await seedCandidates();
});

afterAll(async () => {
  await testSql.end();
});

async function ids(filters: Parameters<typeof listCandidates>[1], userId?: string) {
  const page = await listCandidates(testDb, { pageSize: 50, ...filters }, userId ? { userId } : {});
  return page.items.map((item) => item.externalId);
}

describe("candidate catalog queries", () => {
  it("exposes only candidates from the latest successful snapshot", async () => {
    const page = await listCandidates(testDb, { order: "name" });

    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 20, totalPages: 1 });
    expect(page.items.map((item) => item.externalId)).toEqual(["1010", "2020", "3030"]);
    expect(await getCandidateDetail(testDb, 2026, seeded.stale.externalId)).toBeNull();
  });

  it.each([
    ["query", { query: "bia" }, ["2020"]],
    ["number query", { query: "3030" }, ["3030"]],
    ["election", { electionYears: [2026] }, ["1010", "2020", "3030"]],
    ["office", { offices: ["deputado_federal"] }, ["1010"]],
    ["region", { regions: ["SP"] }, ["2020"]],
    ["party", { parties: ["XYZ"] }, ["2020"]],
    ["round", { rounds: [2] }, ["3030"]],
    ["status", { statuses: ["APTO COM RECURSO"] }, ["2020"]],
    ["federation", { federations: ["Federação C"] }, ["3030"]],
    ["coalition", { coalitions: ["Coligação A"] }, ["1010"]],
    ["age equality", { ageMin: 30, ageMax: 30 }, ["2020"]],
    ["gender", { genders: ["FEMININO"] }, ["1010"]],
    ["race", { races: ["PRETA"] }, ["3030"]],
    ["education", { educations: ["DOUTORADO"] }, ["3030"]],
    ["occupation", { occupations: ["PROFESSORA"] }, ["1010"]],
  ] as const)("applies the %s filter", async (_name, filters, expected) => {
    expect((await ids(filters as Parameters<typeof listCandidates>[1])).toSorted()).toEqual([...expected].toSorted());
  });

  it("distinguishes declared zero assets, missing assets, and exact aggregate boundaries", async () => {
    expect((await ids({ declaredAssets: "yes" })).toSorted()).toEqual(["1010", "3030"]);
    expect(await ids({ declaredAssets: "no" })).toEqual(["2020"]);
    expect(await ids({ assetMinCents: 0n, assetMaxCents: 0n })).toEqual(["3030"]);
    expect(await ids({ assetMinCents: 10_000n, assetMaxCents: 10_000n })).toEqual(["1010"]);
    expect(await ids({ assetCountMin: 2, assetCountMax: 2 })).toEqual(["1010"]);
    expect(await ids({ assetCategories: ["Veículo"] })).toEqual(["1010"]);
  });

  it("keeps zero campaign totals distinct from finances not published", async () => {
    expect((await ids({ hasFinance: true })).toSorted()).toEqual(["1010", "2020"]);
    expect(await ids({ hasFinance: false })).toEqual(["3030"]);
    expect(await ids({ revenueMinCents: 0n, revenueMaxCents: 0n })).toEqual(["2020"]);
    expect(await ids({ expenseMinCents: 20_000n, expenseMaxCents: 20_000n })).toEqual(["1010"]);
    expect(await ids({ balanceMinCents: 30_000n, balanceMaxCents: 30_000n })).toEqual(["1010"]);
    expect(await ids({ fundingKinds: ["public"] })).toEqual(["1010"]);

    const page = await listCandidates(testDb, { order: "number" });
    expect(page.items.map((item) => [item.externalId, item.finance?.revenueCents ?? null])).toEqual([
      ["1010", "50000"], ["2020", "0"], ["3030", null],
    ]);
  });

  it("applies every availability filter", async () => {
    for (const [filter, expected] of [
      [{ hasPhoto: true }, ["1010"]],
      [{ hasPhoto: false }, ["2020", "3030"]],
      [{ hasSocial: true }, ["1010"]],
      [{ hasGovernmentPlan: true }, ["1010"]],
      [{ hasCertificates: true }, ["1010"]],
    ] as const) {
      expect((await ids(filter)).toSorted()).toEqual([...expected].toSorted());
    }
  });

  it("uses only confirmed lawmaker links for houses, mandate, topics and aggregates", async () => {
    expect((await ids({ hasConfirmedLawmaker: true })).toSorted()).toEqual(["1010", "3030"]);
    expect(await ids({ hasConfirmedLawmaker: false })).toEqual(["2020"]);
    expect(await ids({ lawmakerHouses: ["camara"] })).toEqual(["1010"]);
    expect(await ids({ lawmakerHouses: ["senado"] })).toEqual(["3030"]);
    expect(await ids({ activeMandate: true })).toEqual(["1010"]);
    expect(await ids({ activeMandate: false })).toEqual(["3030"]);
    expect(await ids({ topics: ["Trabalho"] })).toEqual(["1010"]);
    expect(await ids({ topics: ["Tema pendente"] })).toEqual([]);

    const page = await listCandidates(testDb, { order: "projects_desc" });
    expect(page.items.map((item) => [item.externalId, item.projectCount, item.voteCount])).toEqual([
      ["1010", 2, 2], ["3030", 1, 1], ["2020", 0, 0],
    ]);
  });

  it("scopes followed-only to the authenticated user", async () => {
    await expect(ids({ followedOnly: true })).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(await ids({ followedOnly: true }, seeded.user.id)).toEqual(["1010"]);
  });

  it.each([
    ["name", ["1010", "2020", "3030"]],
    ["number", ["1010", "2020", "3030"]],
    ["updated", ["1010", "2020", "3030"]],
    ["assets_desc", ["1010", "3030", "2020"]],
    ["revenue_desc", ["1010", "2020", "3030"]],
    ["expenses_desc", ["1010", "2020", "3030"]],
    ["projects_desc", ["1010", "3030", "2020"]],
    ["votes_desc", ["1010", "3030", "2020"]],
  ] as const)("orders deterministically by %s", async (order, expected) => {
    expect(await ids({ order })).toEqual(expected);
  });

  it("keeps count, list and pagination totals in parity", async () => {
    const filters: Parameters<typeof listCandidates>[1] = { regions: ["ES"], page: 2, pageSize: 1 };
    const [count, page] = await Promise.all([
      countCandidates(testDb, filters),
      listCandidates(testDb, filters),
    ]);

    expect(count).toBe(2);
    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 1, totalPages: 2 });
    expect(page.items).toHaveLength(1);
  });

  it("lists only current-snapshot filter options and confirmed legislative topics", async () => {
    const options = await listCandidateFilterOptions(testDb);

    expect(options.electionYears).toEqual([2026]);
    expect(options.snapshots).toEqual([{ electionYear: 2026, extractedAt: extractedAt.toISOString() }]);
    expect(options.regions).toEqual(["ES", "SP"]);
    expect(options.parties).toEqual(["ABC", "XYZ"]);
    expect(options.statuses).not.toContain("INDEFERIDO ANTIGO");
    expect(options.occupations).not.toContain("OCUPAÇÃO ANTIGA");
    expect(options.assetCategories).not.toContain("Antigo");
    expect(options.topics).toEqual(["Direitos humanos", "Educação", "Saúde", "Trabalho"]);
    expect(options.topics).not.toContain("Tema pendente");
  });

  it("returns a current detail with official children and confirmed history only", async () => {
    const detail = await getCandidateDetail(testDb, 2026, "1010");
    const pending = await getCandidateDetail(testDb, 2026, "2020");

    expect(detail).toMatchObject({
      externalId: "1010",
      assetTotalCents: "10000",
      assetCount: 2,
      finance: { revenueCents: "50000", expenseCents: "20000", balanceCents: "30000" },
      history: { projectCount: 2, voteCount: 2, topics: ["Direitos humanos", "Saúde", "Trabalho"] },
    });
    expect(detail?.assets).toHaveLength(2);
    expect(detail?.socialLinks).toEqual([{ label: "Instagram", url: "https://example.test/ana" }]);
    expect(detail?.documents.map((document) => document.kind).toSorted()).toEqual(["certificate", "government_plan"]);
    expect(pending?.history).toBeNull();
    expect(pending?.projectCount).toBe(0);
    expect(pending?.voteCount).toBe(0);
  });
});

function post(body: unknown, headers: HeadersInit = {}) {
  return new Request(`${origin}/api/candidates/filter-count`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...headers },
    body: JSON.stringify(body),
  });
}

describe("candidate filter count route", () => {
  it("returns a public JSON-safe count with the same filters as the list", async () => {
    const response = await countPost(post({ filters: { assetMin: "100", topics: ["Trabalho"] } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ total: 1 });
  });

  it("requires a session only for followed-only", async () => {
    const anonymous = await countPost(post({ filters: { followedOnly: true } }));
    const authenticated = await countPost(post(
      { filters: { followedOnly: true } },
      { cookie: `pulso_session=${seeded.session.token}` },
    ));

    expect(anonymous.status).toBe(401);
    await expect(anonymous.json()).resolves.toEqual({ code: "AUTH_REQUIRED" });
    expect(authenticated.status).toBe(200);
    await expect(authenticated.json()).resolves.toEqual({ total: 1 });
  });

  it("rejects cross-origin, unknown, malformed and overlarge requests", async () => {
    const crossOrigin = await countPost(new Request(`${origin}/api/candidates/filter-count`, {
      method: "POST", headers: { origin: "https://attacker.test" }, body: "{}",
    }));
    const unknown = await countPost(post({ filters: {}, forgedUserId: seeded.user.id }));
    const malformed = await countPost(new Request(`${origin}/api/candidates/filter-count`, {
      method: "POST", headers: { origin }, body: "{bad-json",
    }));
    const overlarge = await countPost(post({ filters: {} }, { "content-length": "65537" }));

    expect(crossOrigin.status).toBe(403);
    expect(unknown.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(overlarge.status).toBe(413);
  });
});
