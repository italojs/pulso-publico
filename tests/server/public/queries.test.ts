import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  billAuthors,
  bills,
  billTopics,
  individualVotes,
  lawmakers,
  movements,
  voteEvents,
} from "#/server/db/schema";
import {
  getPublicBill,
  getPublicLawmaker,
  listPublicBills,
  listPublicFilterOptions,
} from "#/server/public/queries";
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

  const [workBill, healthBill] = await testDb
    .insert(bills)
    .values([
      {
        source: "camara",
        externalId: "501",
        officialCode: "PEC 8/2025",
        congressionalKey: "PEC-8-2025",
        officialTitle: "Proposta de Emenda à Constituição nº 8, de 2025",
        officialSummary: "Reduz a jornada semanal e altera a escala de trabalho.",
        originHouse: "camara",
        currentHouse: "camara",
        statusCode: "comissao",
        statusLabel: "Aguardando parecer na comissão",
        officialUrl: "https://www.camara.leg.br/propostas-legislativas/501",
        presentedAt: new Date("2025-02-01T12:00:00.000Z"),
        checkedAt,
      },
      {
        source: "senado",
        externalId: "601",
        officialCode: "PL 12/2024",
        congressionalKey: "PL-12-2024",
        officialTitle: "Projeto de Lei nº 12, de 2024",
        officialSummary: "Dispõe sobre atendimento básico de saúde.",
        originHouse: "senado",
        currentHouse: "senado",
        statusCode: "plenario",
        statusLabel: "Pronto para deliberação do Plenário",
        officialUrl: "https://www25.senado.leg.br/web/atividade/materias/-/materia/601",
        presentedAt: new Date("2024-05-10T12:00:00.000Z"),
        checkedAt,
      },
    ])
    .returning();
  if (!workBill || !healthBill) throw new Error("bills not seeded");

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
  ]);
  const [vote] = await testDb
    .insert(voteEvents)
    .values({
      source: "camara",
      externalId: "vote-501",
      billId: workBill.id,
      occurredAt: new Date("2026-08-31T18:00:00.000Z"),
      house: "camara",
      description: "Votação do parecer",
      result: "Aprovado",
      isNominal: true,
      isSecret: false,
      officialUrl: workBill.officialUrl,
      checkedAt,
    })
    .returning();
  if (!vote) throw new Error("vote not seeded");
  await testDb.insert(individualVotes).values({
    source: "camara",
    externalId: "individual-501-100",
    voteEventId: vote.id,
    lawmakerId: deputy.id,
    choice: "sim",
    rawChoice: "Sim",
    officialUrl: workBill.officialUrl,
    checkedAt,
  });
}

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await truncateLegislativeTables();
  await seedPublicData();
});

afterAll(async () => {
  await testSql.end();
});

describe("public legislative queries", () => {
  it("lists bills ordered by latest official activity", async () => {
    const result = await listPublicBills(testDb, {});

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.officialCode)).toEqual([
      "PEC 8/2025",
      "PL 12/2024",
    ]);
    expect(result.items[0]).toMatchObject({
      source: "camara",
      topics: ["Trabalho e Emprego"],
      authors: [{ name: "Ana Cidadã", party: "ABC" }],
      latestActivityAt: "2026-08-31T18:00:00.000Z",
    });
  });

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
    expect(result.totalPages).toBe(2);
    expect(result.items[0]?.officialCode).toBe("PL 12/2024");
  });

  it("loads a bill graph in chronological display order", async () => {
    const project = await getPublicBill(testDb, "camara", "501");

    expect(project).not.toBeNull();
    expect(project?.authors[0]?.lawmakerExternalId).toBe("100");
    expect(project?.timeline[0]?.description).toBe("Designado relator na comissão.");
    expect(project?.voteEvents[0]?.individualVotes[0]).toMatchObject({
      lawmakerName: "Ana Cidadã",
      choice: "sim",
    });
  });

  it("loads a neutral lawmaker profile with authored bills and votes", async () => {
    const profile = await getPublicLawmaker(testDb, "camara", "100");

    expect(profile).not.toBeNull();
    expect(profile?.lawmaker).toMatchObject({ name: "Ana Cidadã", party: "ABC" });
    expect(profile?.authoredBills[0]?.officialCode).toBe("PEC 8/2025");
    expect(profile?.votes[0]).toMatchObject({
      choice: "sim",
      result: "Aprovado",
      billExternalId: "501",
    });
  });

  it("returns distinct options for accessible filters", async () => {
    const options = await listPublicFilterOptions(testDb);

    expect(options.sources).toEqual(["camara", "senado"]);
    expect(options.topics).toEqual(["Saúde", "Trabalho e Emprego"]);
    expect(options.parties).toEqual(["ABC", "XYZ"]);
    expect(options.authors).toEqual(["Ana Cidadã", "Bruno Federal"]);
  });
});
