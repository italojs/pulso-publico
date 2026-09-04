import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

import {
  billAuthors,
  bills,
  billTopics,
  followedBills,
  individualVotes,
  lawmakers,
  movements,
  users,
  voteEvents,
} from "#/server/db/schema";
import {
  countPublicBills,
  getPublicBill,
  getPublicLawmaker,
  listPublicBills,
  listPublicFilterOptions,
} from "#/server/public/queries";
import type { PublicBillFilters } from "#/server/public/read-models";
import {
  migrateTestDatabase,
  testDb,
  testSql,
  truncateLegislativeTables,
} from "../../setup-database.ts";

const checkedAt = new Date("2026-09-03T12:00:00.000Z");

async function seedPublicData() {
  const [deputy, senator] = await testDb
    .insert(lawmakers)
    .values([
      {
        source: "camara",
        externalId: "100",
        name: "Ana Cidadã",
        electoralName: "Ana Cidadã",
        role: "deputado_federal",
        party: "ABC",
        region: "PE",
        photoUrl: null,
        active: true,
        officialUrl: "https://www.camara.leg.br/deputados/100",
        checkedAt,
      },
      {
        source: "senado",
        externalId: "200",
        name: "Bruno Federal",
        electoralName: "Bruno Federal",
        role: "senador",
        party: "XYZ",
        region: "SP",
        photoUrl: null,
        active: true,
        officialUrl: "https://www25.senado.leg.br/web/senadores/senador/-/perfil/200",
        checkedAt,
      },
    ])
    .returning();
  if (!deputy || !senator) throw new Error("lawmakers not seeded");

  const [workBill, healthBill, noVoteBill] = await testDb
    .insert(bills)
    .values([
      {
        id: "00000000-0000-4000-8000-000000000002",
        source: "camara",
        externalId: "501",
        officialCode: "PEC 8/2025",
        proposalType: "PEC",
        proposalNumber: 8,
        proposalYear: 2025,
        congressionalKey: "PEC-8-2025",
        officialTitle: "Proposta de Emenda à Constituição nº 8, de 2025",
        officialSummary: "Reduz a jornada semanal e altera a escala de trabalho.",
        originHouse: "camara",
        currentHouse: "camara",
        statusCode: "comissao",
        statusLabel: "Aguardando parecer na comissão",
        simplifiedStage: "committees",
        officialUrl: "https://www.camara.leg.br/propostas-legislativas/501",
        presentedAt: new Date("2025-02-01T12:00:00.000Z"),
        checkedAt,
      },
      {
        id: "00000000-0000-4000-8000-000000000001",
        source: "senado",
        externalId: "601",
        officialCode: "PL 12/2024",
        proposalType: "PL",
        proposalNumber: 12,
        proposalYear: 2024,
        congressionalKey: "PL-12-2024",
        officialTitle: "Projeto de Lei nº 12, de 2024",
        officialSummary: "Dispõe sobre atendimento básico de saúde.",
        originHouse: "camara",
        currentHouse: "senado",
        statusCode: "plenario",
        statusLabel: "Pronto para deliberação do Plenário",
        simplifiedStage: "ready_for_vote",
        officialUrl: "https://www25.senado.leg.br/web/atividade/materias/-/materia/601",
        presentedAt: new Date("2024-05-10T12:00:00.000Z"),
        checkedAt,
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        source: "camara",
        externalId: "701",
        officialCode: "Projeto sem votação",
        proposalType: null,
        proposalNumber: null,
        proposalYear: null,
        congressionalKey: null,
        officialTitle: "Projeto sem identidade estruturada",
        officialSummary: "Cria ações de apoio à educação pública.",
        originHouse: "senado",
        currentHouse: null,
        statusCode: "apresentada",
        statusLabel: "Apresentada sem classificação",
        simplifiedStage: "unclassified",
        officialUrl: "https://www.camara.leg.br/propostas-legislativas/701",
        presentedAt: null,
        checkedAt,
      },
    ])
    .returning();
  if (!workBill || !healthBill || !noVoteBill) throw new Error("bills not seeded");

  await testDb.insert(billAuthors).values([
    {
      source: "camara",
      externalId: "author-501",
      billId: workBill.id,
      lawmakerId: deputy.id,
      officialName: deputy.name,
      party: "ABC",
      authorKind: "Deputada Federal",
      isPrimary: true,
      officialUrl: deputy.officialUrl,
      checkedAt,
    },
    {
      source: "senado",
      externalId: "author-601",
      billId: healthBill.id,
      lawmakerId: senator.id,
      officialName: senator.name,
      party: "XYZ",
      authorKind: "Senador",
      isPrimary: true,
      officialUrl: senator.officialUrl,
      checkedAt,
    },
    {
      source: "camara",
      externalId: "author-701",
      billId: noVoteBill.id,
      lawmakerId: null,
      officialName: "Instituto Educação",
      party: null,
      authorKind: "Entidade",
      isPrimary: true,
      officialUrl: noVoteBill.officialUrl,
      checkedAt,
    },
  ]);
  await testDb.insert(billTopics).values([
    {
      source: "camara",
      externalId: "topic-501",
      billId: workBill.id,
      code: "40",
      label: "Trabalho e Emprego",
      officialUrl: workBill.officialUrl,
      checkedAt,
    },
    {
      source: "senado",
      externalId: "topic-601",
      billId: healthBill.id,
      code: "50",
      label: "Saúde",
      officialUrl: healthBill.officialUrl,
      checkedAt,
    },
    {
      source: "camara",
      externalId: "topic-701",
      billId: noVoteBill.id,
      code: "60",
      label: "Educação",
      officialUrl: noVoteBill.officialUrl,
      checkedAt,
    },
  ]);
  await testDb.insert(movements).values([
    {
      source: "camara",
      externalId: "move-501-1",
      billId: workBill.id,
      occurredAt: new Date("2026-08-30T14:00:00.000Z"),
      sequence: 1,
      house: "camara",
      bodyCode: "CTASP",
      bodyName: "Comissão de Trabalho",
      statusCode: "comissao",
      statusLabel: "Em análise",
      officialDescription: "Designado relator na comissão.",
      officialUrl: workBill.officialUrl,
      checkedAt,
    },
    {
      source: "senado",
      externalId: "move-601-1",
      billId: healthBill.id,
      occurredAt: new Date("2026-08-20T10:00:00.000Z"),
      sequence: 1,
      house: "senado",
      bodyCode: "PLEN",
      bodyName: "Plenário",
      statusCode: "plenario",
      statusLabel: "Pronto para deliberação",
      officialDescription: "Incluído na pauta do Plenário.",
      officialUrl: healthBill.officialUrl,
      checkedAt,
    },
    {
      source: "senado",
      externalId: "move-601-2",
      billId: healthBill.id,
      occurredAt: new Date("2026-08-29T10:00:00.000Z"),
      sequence: 2,
      house: "senado",
      bodyCode: "PLEN",
      bodyName: "Plenário",
      statusCode: "plenario",
      statusLabel: "Em deliberação",
      officialDescription: "Aberta a deliberação do projeto.",
      officialUrl: healthBill.officialUrl,
      checkedAt,
    },
  ]);
  const [workVote, secondWorkVote, healthVote] = await testDb
    .insert(voteEvents)
    .values([
      {
        source: "camara",
        externalId: "vote-501",
        billId: workBill.id,
        occurredAt: new Date("2026-08-31T18:00:00.000Z"),
        house: "senado",
        description: "Votação secreta do parecer",
        result: "Rejeitado",
        resultCategory: "rejected",
        isNominal: false,
        isSecret: true,
        officialUrl: workBill.officialUrl,
        checkedAt,
      },
      {
        source: "camara",
        externalId: "vote-501-2",
        billId: workBill.id,
        occurredAt: new Date("2026-09-05T02:30:00.000Z"),
        house: "senado",
        description: "Votação não nominal no fim do dia brasileiro",
        result: null,
        resultCategory: "unavailable",
        isNominal: false,
        isSecret: false,
        officialUrl: workBill.officialUrl,
        checkedAt,
      },
      {
        source: "senado",
        externalId: "vote-601",
        billId: healthBill.id,
        occurredAt: new Date("2026-08-30T12:00:00.000Z"),
        house: "camara",
        description: "Votação nominal do projeto",
        result: "Aprovado",
        resultCategory: "approved",
        isNominal: true,
        isSecret: false,
        officialUrl: healthBill.officialUrl,
        checkedAt,
      },
    ])
    .returning();
  if (!workVote || !secondWorkVote || !healthVote) throw new Error("votes not seeded");
  await testDb.insert(individualVotes).values({
    source: "senado",
    externalId: "individual-601-200",
    voteEventId: healthVote.id,
    lawmakerId: senator.id,
    choice: "sim",
    rawChoice: "Sim",
    officialUrl: healthBill.officialUrl,
    checkedAt,
  });

  const [user] = await testDb
    .insert(users)
    .values({ email: "leitora@example.com", passwordHash: "hash" })
    .returning();
  if (!user) throw new Error("user not seeded");
  await testDb.insert(followedBills).values({ userId: user.id, billId: healthBill.id });

  return { userId: user.id };
}

let seeded: Awaited<ReturnType<typeof seedPublicData>>;

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await truncateLegislativeTables();
  seeded = await seedPublicData();
});

afterAll(async () => {
  await testSql.end();
});

describe("public legislative queries", () => {
  it("lists bills ordered by latest official activity", async () => {
    const result = await listPublicBills(testDb, {});

    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.officialCode)).toEqual([
      "PEC 8/2025",
      "PL 12/2024",
      "Projeto sem votação",
    ]);
    expect(result.items[0]).toMatchObject({
      source: "camara",
      topics: ["Trabalho e Emprego"],
      authors: [{ name: "Ana Cidadã", party: "ABC" }],
      latestActivityAt: "2026-09-05T02:30:00.000Z",
    });
  });

  it.each([
    [{ proposalTypes: ["PEC"] }, ["PEC 8/2025"]],
    [{ proposalNumber: 12, yearFrom: 2024, yearTo: 2024 }, ["PL 12/2024"]],
    [{ sources: ["senado"] }, ["PL 12/2024"]],
    [{ originHouses: ["camara"], currentHouses: ["senado"] }, ["PL 12/2024"]],
    [{ stages: ["committees"] }, ["PEC 8/2025"]],
    [{ statuses: ["Pronto para deliberação do Plenário"] }, ["PL 12/2024"]],
    [{ votePresence: "without" }, ["Projeto sem votação"]],
    [{ voteKinds: ["nominal"], individualVoteAvailability: "available" }, ["PL 12/2024"]],
    [{ voteKinds: ["secret"] }, ["PEC 8/2025"]],
    [{ voteKinds: ["non_nominal"] }, ["PEC 8/2025"]],
    [{ individualVoteAvailability: "unavailable" }, ["PEC 8/2025"]],
    [{ voteResults: ["approved"], voteHouses: ["camara"] }, ["PL 12/2024"]],
    [{ topics: ["Educação"] }, ["Projeto sem votação"]],
    [{ authors: ["Ana Cidadã"] }, ["PEC 8/2025"]],
    [{ parties: ["XYZ"] }, ["PL 12/2024"]],
    [{ regions: ["SP"] }, ["PL 12/2024"]],
    [{ regions: ["nao_informada"] }, ["Projeto sem votação"]],
  ] satisfies Array<[PublicBillFilters, string[]]>)("filters %#", async (filters, expected) => {
    const result = await listPublicBills(testDb, filters);
    expect(result.items.map((item) => item.officialCode)).toEqual(expected);
  });

  it("combines selected values with OR and different facets with AND", async () => {
    const typeOr = await listPublicBills(testDb, { proposalTypes: ["PEC", "PL"] });
    const topicOr = await listPublicBills(testDb, { topics: ["Educação", "Saúde"] });
    const crossFacetAnd = await listPublicBills(testDb, {
      proposalTypes: ["PL"],
      topics: ["Saúde"],
      presentedStart: "2024-05-10",
      presentedEnd: "2024-05-10",
    });

    expect(typeOr.items.map((item) => item.officialCode)).toEqual(["PEC 8/2025", "PL 12/2024"]);
    expect(topicOr.items.map((item) => item.officialCode)).toEqual(["PL 12/2024", "Projeto sem votação"]);
    expect(crossFacetAnd.items.map((item) => item.officialCode)).toEqual(["PL 12/2024"]);
  });

  it("treats presentation and activity date bounds as inclusive calendar days", async () => {
    const presented = await listPublicBills(testDb, {
      presentedStart: "2025-02-01",
      presentedEnd: "2025-02-01",
    });
    const activity = await listPublicBills(testDb, {
      activityStart: "2026-09-04",
      activityEnd: "2026-09-04",
    });

    expect(presented.items.map((item) => item.officialCode)).toEqual(["PEC 8/2025"]);
    expect(activity.items.map((item) => item.officialCode)).toEqual(["PEC 8/2025"]);
  });

  it("uses PostgreSQL server time for canonical recent-activity presets and ignores custom bounds", async () => {
    const [clock] = await testSql<{ serverNow: string }[]>`select now() as "serverNow"`;
    if (!clock) throw new Error("database clock unavailable");
    const now = new Date(clock.serverNow).getTime();
    await testDb.insert(bills).values([
      ["00000000-0000-4000-8000-000000000010", "recent-12h", "Relógio 12h", 12],
      ["00000000-0000-4000-8000-000000000011", "recent-3d", "Relógio 3d", 72],
      ["00000000-0000-4000-8000-000000000012", "recent-15d", "Relógio 15d", 360],
      ["00000000-0000-4000-8000-000000000013", "recent-40d", "Relógio 40d", 960],
    ].map(([id, externalId, officialCode, hours]) => ({
      id: String(id), source: "camara" as const, externalId: String(externalId), officialCode: String(officialCode),
      officialTitle: String(officialCode), officialSummary: "Teste do relógio do servidor", originHouse: "camara" as const,
      currentHouse: "camara" as const, statusLabel: "Em análise", officialUrl: `https://example.test/${externalId}`,
      presentedAt: new Date(now - Number(hours) * 60 * 60 * 1_000), checkedAt,
    })));

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("1900-01-01T00:00:00.000Z"));
    try {
      const codes = async (filters: PublicBillFilters) => (await listPublicBills(testDb, filters)).items
        .map((item) => item.officialCode).filter((code) => code.startsWith("Relógio"));

      expect(await codes({ recentActivity: "24h" })).toEqual(["Relógio 12h"]);
      expect(await codes({ recentActivity: "7d" })).toEqual(["Relógio 12h", "Relógio 3d"]);
      expect(await codes({ recentActivity: "30d" })).toEqual(["Relógio 12h", "Relógio 3d", "Relógio 15d"]);
      expect(await codes({ recentActivity: "30d", activityStart: "2099-01-01", activityEnd: "2099-01-02" }))
        .toEqual(["Relógio 12h", "Relógio 3d", "Relógio 15d"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores impossible calendar dates in list and count queries", async () => {
    const [result, total] = await Promise.all([
      listPublicBills(testDb, { presentedStart: "2026-02-30" }),
      countPublicBills(testDb, { activityEnd: "2026-99-99" }),
    ]);

    expect(result.total).toBe(3);
    expect(total).toBe(3);
  });

  it("keeps missing official activity null and ignores the internal update timestamp", async () => {
    await testDb
      .update(bills)
      .set({ updatedAt: new Date("2030-01-01T00:00:00.000Z") })
      .where(eq(bills.externalId, "701"));

    const result = await listPublicBills(testDb, {});
    const unknownActivity = result.items.find((item) => item.externalId === "701");
    const filtered = await listPublicBills(testDb, {
      activityStart: "2029-12-31",
      activityEnd: "2030-01-01",
    });

    expect(result.items.at(-1)?.externalId).toBe("701");
    expect(unknownActivity?.latestActivityAt).toBeNull();
    expect(filtered.items).toEqual([]);
  });

  it("does not classify secret votes as non-nominal", async () => {
    const result = await listPublicBills(testDb, {
      voteKinds: ["non_nominal"],
      voteResults: ["rejected"],
    });

    expect(result.items).toEqual([]);
  });

  it("selects projects whose current house is not informed", async () => {
    const result = await listPublicBills(testDb, { currentHouses: ["nao_informada"] });

    expect(result.items.map((item) => item.officialCode)).toEqual(["Projeto sem votação"]);
  });

  it("resolves followed projects from authenticated and anonymous scopes", async () => {
    const authenticated = await listPublicBills(testDb, { followedOnly: true }, { userId: seeded.userId });
    const anonymous = await listPublicBills(testDb, { followedOnly: true }, {
      anonymousBillKeys: [
        { source: "camara", externalId: "501" },
        { source: "senado", externalId: "missing" },
      ],
    });
    const empty = await listPublicBills(testDb, { followedOnly: true }, { anonymousBillKeys: [] });

    expect(authenticated.items.map((item) => item.officialCode)).toEqual(["PL 12/2024"]);
    expect(anonymous.items.map((item) => item.officialCode)).toEqual(["PEC 8/2025"]);
    expect(empty).toMatchObject({ items: [], total: 0 });
  });

  it("paginates anonymous followed projects within their filtered scope", async () => {
    const result = await listPublicBills(testDb, {
      followedOnly: true,
      page: 2,
      pageSize: 1,
    }, {
      anonymousBillKeys: [
        { source: "camara", externalId: "501" },
        { source: "senado", externalId: "601" },
      ],
    });

    expect(result).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect(result.items.map((item) => item.officialCode)).toEqual(["PL 12/2024"]);
  });

  it.each([
    ["updated", ["PEC 8/2025", "PL 12/2024", "Projeto sem votação"]],
    ["presented_desc", ["PEC 8/2025", "PL 12/2024", "Projeto sem votação"]],
    ["presented_asc", ["PL 12/2024", "PEC 8/2025", "Projeto sem votação"]],
    ["most_movements", ["PL 12/2024", "PEC 8/2025", "Projeto sem votação"]],
    ["most_votes", ["PEC 8/2025", "PL 12/2024", "Projeto sem votação"]],
  ] as const)("orders by %s", async (order, expected) => {
    const result = await listPublicBills(testDb, { order });

    expect(result.items.map((item) => item.officialCode)).toEqual(expected);
  });

  it("keeps countPublicBills in parity with the paginated list", async () => {
    const filters = { proposalTypes: ["PEC", "PL"], topics: ["Saúde", "Trabalho e Emprego"], pageSize: 1 };
    const [count, result] = await Promise.all([
      countPublicBills(testDb, filters),
      listPublicBills(testDb, filters),
    ]);

    expect(count).toBe(2);
    expect(result).toMatchObject({ total: count, pageSize: 1, totalPages: 2 });
  });

  it.each(["presented_desc", "presented"] as const)(
    "sorts by presentedAt for order %s",
    async (order) => {
      await testDb
        .update(bills)
        .set({ presentedAt: new Date("2026-09-02T12:00:00.000Z") })
        .where(eq(bills.externalId, "601"));

      const result = await listPublicBills(testDb, { order });

      expect(result.items.map((item) => item.officialCode)).toEqual([
        "PL 12/2024",
        "PEC 8/2025",
        "Projeto sem votação",
      ]);
    },
  );

  it.each(["presented_desc", "presented"] as const)(
    "uses bills.id as the final tie-breaker for order %s",
    async (order) => {
      await testDb
        .update(bills)
        .set({ presentedAt: new Date("2025-01-01T12:00:00.000Z") })
        .where(inArray(bills.externalId, ["501", "601"]));

      const result = await listPublicBills(testDb, { order });

      expect(result.items.map((item) => item.externalId)).toEqual(["601", "501", "701"]);
    },
  );

  it("combines text, source, topic, party, author and status filters", async () => {
    const result = await listPublicBills(testDb, {
      query: "jornada",
      source: "camara",
      topic: "Trabalho e Emprego",
      party: "ABC",
      author: "Ana Cidadã",
      status: "Aguardando parecer na comissão",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.externalId).toBe("501");
  });

  it("paginates with a bounded page size", async () => {
    const result = await listPublicBills(testDb, { page: 2, pageSize: 1 });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(1);
    expect(result.totalPages).toBe(3);
    expect(result.items[0]?.officialCode).toBe("PL 12/2024");
  });

  it("loads a bill graph in chronological display order", async () => {
    const project = await getPublicBill(testDb, "camara", "501");

    expect(project).not.toBeNull();
    expect(project?.authors[0]?.lawmakerExternalId).toBe("100");
    expect(project?.timeline[0]?.description).toBe("Designado relator na comissão.");
    expect(project?.voteEvents[0]?.individualVotes).toEqual([]);
  });

  it("loads a neutral lawmaker profile with authored bills and votes", async () => {
    const profile = await getPublicLawmaker(testDb, "senado", "200");

    expect(profile).not.toBeNull();
    expect(profile?.lawmaker).toMatchObject({ name: "Bruno Federal", party: "XYZ" });
    expect(profile?.authoredBills[0]?.officialCode).toBe("PL 12/2024");
    expect(profile?.votes[0]).toMatchObject({
      choice: "sim",
      result: "Aprovado",
      billExternalId: "601",
    });
  });

  it("returns distinct options for accessible filters", async () => {
    const options = await listPublicFilterOptions(testDb);

    expect(options.sources).toEqual(["camara", "senado"]);
    expect(options.proposalTypes).toEqual(["PEC", "PL"]);
    expect(options.years).toEqual([2024, 2025]);
    expect(options.originHouses).toEqual([
      { value: "camara", label: "Câmara dos Deputados" },
      { value: "senado", label: "Senado Federal" },
    ]);
    expect(options.currentHouses).toEqual([
      { value: "camara", label: "Câmara dos Deputados" },
      { value: "senado", label: "Senado Federal" },
      { value: "nao_informada", label: "Não informada" },
    ]);
    expect(options.stages).toEqual([
      { value: "committees", label: "Em comissões" },
      { value: "ready_for_vote", label: "Pronto para votação" },
      { value: "unclassified", label: "Fase não classificada" },
    ]);
    expect(options.voteKinds).toEqual([
      { value: "nominal", label: "Nominal" },
      { value: "secret", label: "Secreta" },
      { value: "non_nominal", label: "Não nominal" },
    ]);
    expect(options.voteResults).toEqual([
      { value: "approved", label: "Aprovada" },
      { value: "rejected", label: "Rejeitada" },
      { value: "unavailable", label: "Resultado não informado" },
    ]);
    expect(options.voteHouses).toEqual([
      { value: "camara", label: "Câmara dos Deputados" },
      { value: "senado", label: "Senado Federal" },
    ]);
    expect(options.topics).toEqual(["Educação", "Saúde", "Trabalho e Emprego"]);
    expect(options.parties).toEqual(["ABC", "XYZ"]);
    expect(options.authors).toEqual(["Ana Cidadã", "Bruno Federal", "Instituto Educação"]);
    expect(options.regions).toEqual([
      { value: "PE", label: "PE" },
      { value: "SP", label: "SP" },
      { value: "nao_informada", label: "Não informada" },
    ]);
  });

  it("does not offer non-nominal when the dataset only has nominal and secret votes", async () => {
    await testDb.delete(voteEvents).where(eq(voteEvents.externalId, "vote-501-2"));

    const options = await listPublicFilterOptions(testDb);

    expect(options.voteKinds).toContainEqual({ value: "secret", label: "Secreta" });
    expect(options.voteKinds).not.toContainEqual({ value: "non_nominal", label: "Não nominal" });
  });
});
