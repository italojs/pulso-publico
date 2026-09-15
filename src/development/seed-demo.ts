import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { billAuthors, billHydrationState, bills, billTopics, lawmakers, movements } from "#/server/db/schema";
import type * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;

const examples = [
  { id: "00000000-0000-4000-8000-000000000001", source: "camara", title: "Acesso a bibliotecas comunitárias", topic: "Educação", stage: "committees", status: "Em análise — demonstração" },
  { id: "00000000-0000-4000-8000-000000000002", source: "senado", title: "Transparência no transporte público", topic: "Transparência", stage: "presented", status: "Apresentado — demonstração" },
  { id: "00000000-0000-4000-8000-000000000003", source: "camara", title: "Acessibilidade em espaços públicos", topic: "Acessibilidade", stage: "ready_for_vote", status: "Pronto para votação — demonstração" },
] as const;

/** Synthetic, additive and idempotent. The CLI validates the target before connecting. */
export async function seedDemo(database: Database, now = new Date()) {
  return database.transaction(async (transaction) => {
    const demoLawmakers = [
      { id: "00000000-0000-4000-8000-000000000101", source: "camara", role: "deputado_federal" },
      { id: "00000000-0000-4000-8000-000000000102", source: "senado", role: "senador" },
    ] as const;
    await transaction.insert(lawmakers).values(demoLawmakers.map((person) => ({
      ...person,
      externalId: "demo-001",
      name: "Parlamentar Exemplo — pessoa fictícia",
      electoralName: "Pessoa fictícia (demonstração)",
      party: "DEMO",
      region: "DF",
      active: true,
      officialUrl: "https://example.invalid/demonstracao",
      checkedAt: now,
    }))).onConflictDoNothing();

    const inserted = await transaction.insert(bills).values(examples.map((example, index) => ({
      id: example.id,
      source: example.source,
      externalId: `demo-${String(index + 1).padStart(3, "0")}`,
      officialCode: `DEMO ${index + 1}/2026`,
      proposalType: "DEMO",
      proposalNumber: index + 1,
      proposalYear: 2026,
      officialTitle: `[DEMONSTRAÇÃO] ${example.title}`,
      officialSummary: "Registro inteiramente fictício para explorar a interface. Não representa projeto de lei, votação, partido ou pessoa real. Não use como informação política.",
      originHouse: example.source,
      currentHouse: example.source,
      statusLabel: example.status,
      simplifiedStage: example.stage,
      officialUrl: "https://example.invalid/demonstracao",
      presentedAt: new Date("2026-09-01T12:00:00Z"),
      checkedAt: now,
    }))).onConflictDoNothing().returning({ id: bills.id });

    for (const [index, example] of examples.entries()) {
      await transaction.insert(billAuthors).values({
        source: example.source,
        externalId: `demo-author-${index + 1}`,
        billId: example.id,
        lawmakerId: demoLawmakers.find((person) => person.source === example.source)!.id,
        officialName: "Parlamentar Exemplo — pessoa fictícia",
        party: "DEMO",
        authorKind: "Demonstração fictícia",
        isPrimary: true,
        officialUrl: "https://example.invalid/demonstracao",
        checkedAt: now,
      }).onConflictDoNothing();
      await transaction.insert(billTopics).values({
        source: example.source,
        externalId: `demo-topic-${index + 1}`,
        billId: example.id,
        label: `${example.topic} (demonstração)`,
        officialUrl: "https://example.invalid/demonstracao",
        checkedAt: now,
      }).onConflictDoNothing();
      await transaction.insert(movements).values({
        source: example.source,
        externalId: `demo-movement-${index + 1}`,
        billId: example.id,
        occurredAt: new Date("2026-09-02T12:00:00Z"),
        sequence: 1,
        house: example.source,
        statusLabel: example.status,
        officialDescription: "Movimentação fictícia de demonstração — não é registro oficial.",
        officialUrl: "https://example.invalid/demonstracao",
        checkedAt: now,
      }).onConflictDoNothing();
      await transaction.insert(billHydrationState).values({
        billId: example.id,
        status: "complete",
        detailsCheckedAt: now,
      }).onConflictDoNothing();
    }
    return { status: "completed", insertedBills: inserted.length, synthetic: true } as const;
  });
}
