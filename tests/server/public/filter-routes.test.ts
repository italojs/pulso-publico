import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { UserRepository } from "#/auth/user-repository";
import { bills, followedBills, users } from "#/server/db/schema";
import { readPublicFilterRequest } from "#/server/public/filter-contract";
import { POST as countPost } from "../../../app/api/projects/filter-count/route.ts";
import { POST as searchPost } from "../../../app/api/projects/search/route.ts";
import {
  migrateTestDatabase,
  testDb,
  testSql,
  truncateLegislativeTables,
} from "../../setup-database.ts";

const origin = "http://app.test";

function post(path: string, body: unknown, headers: HeadersInit = {}) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...headers },
    body: JSON.stringify(body),
  });
}

function streamingPost(path: string, body: string) {
  const bytes = new TextEncoder().encode(body);
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    duplex: "half",
  };
  return new Request(`${origin}${path}`, init);
}

async function seedPublicBills() {
  const checkedAt = new Date("2026-09-04T12:00:00.000Z");
  const [camaraBill, senadoBill] = await testDb
    .insert(bills)
    .values([
      {
        source: "camara",
        externalId: "route-camara",
        officialCode: "PEC 1/2025",
        officialTitle: "Projeto da Câmara",
        officialSummary: "Resumo da Câmara",
        originHouse: "camara",
        currentHouse: "camara",
        statusLabel: "Em análise",
        simplifiedStage: "committees",
        officialUrl: "https://www.camara.leg.br/propostas-legislativas/route-camara",
        presentedAt: new Date("2025-01-01T12:00:00.000Z"),
        checkedAt,
      },
      {
        source: "senado",
        externalId: "route-senado",
        officialCode: "PL 2/2024",
        officialTitle: "Projeto do Senado",
        officialSummary: "Resumo do Senado",
        originHouse: "senado",
        currentHouse: "senado",
        statusLabel: "Pronto para votação",
        simplifiedStage: "ready_for_vote",
        officialUrl: "https://www25.senado.leg.br/web/atividade/materias/-/materia/route-senado",
        presentedAt: new Date("2024-01-01T12:00:00.000Z"),
        checkedAt,
      },
    ])
    .returning();
  if (!camaraBill || !senadoBill) throw new Error("public bills were not seeded");

  const [user] = await testDb
    .insert(users)
    .values({ email: "filter-routes@example.com", passwordHash: "hash" })
    .returning();
  if (!user) throw new Error("user was not seeded");
  await testDb.insert(followedBills).values({ userId: user.id, billId: senadoBill.id });

  const session = await new UserRepository(testDb).createSession(user.id);
  return { session, user, camaraBill, senadoBill };
}

let seeded: Awaited<ReturnType<typeof seedPublicBills>>;

beforeAll(async () => {
  await migrateTestDatabase();
});

beforeEach(async () => {
  await truncateLegislativeTables();
  seeded = await seedPublicBills();
});

afterAll(async () => {
  await testSql.end();
});

describe("advanced public filter routes", () => {
  it("returns a same-origin filtered count without accepting unknown filters", async () => {
    const response = await countPost(post("/api/projects/filter-count", {
      filters: { sources: ["camara"] },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ total: 1 });

    const invalid = await countPost(post("/api/projects/filter-count", {
      filters: { sources: ["camara"], unexpected: true },
    }));
    expect(invalid.status).toBe(400);
  });

  it("rejects more than two hundred anonymous bill references", async () => {
    const response = await countPost(post("/api/projects/filter-count", {
      filters: { followedOnly: true },
      anonymousBillKeys: Array.from({ length: 201 }, (_, index) => ({
        source: "camara",
        externalId: `bill-${index}`,
      })),
    }));

    expect(response.status).toBe(400);
  });

  it("rejects an announced body larger than 65,536 bytes", async () => {
    const response = await countPost(post("/api/projects/filter-count", {
      filters: {},
    }, { "content-length": "65537" }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ code: "REQUEST_TOO_LARGE" });
  });

  it("rejects a streamed body larger than 65,536 bytes without a content-length header", async () => {
    const request = streamingPost("/api/projects/search", JSON.stringify({
      filters: { query: "x".repeat(65_537) },
    }));
    expect(request.headers.get("content-length")).toBeNull();

    const response = await searchPost(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ code: "REQUEST_TOO_LARGE" });
  });

  it("returns the invalid-request code for malformed same-origin JSON", async () => {
    const response = await countPost(new Request(`${origin}/api/projects/filter-count`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: "{not-json",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "INVALID_FILTER_REQUEST" });
  });

  it("rejects a cross-origin request before parsing its body", async () => {
    const response = await searchPost(new Request(`${origin}/api/projects/search`, {
      method: "POST",
      headers: { origin: "https://attacker.example" },
      body: "{not-json",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "CROSS_ORIGIN_REQUEST" });
  });

  it("returns a paginated search page", async () => {
    const response = await searchPost(post("/api/projects/search", {
      filters: { page: 2, pageSize: 1, order: "presented_desc" },
      anonymousBillKeys: [
        { source: "camara", externalId: seeded.camaraBill.externalId },
        { source: "camara", externalId: seeded.camaraBill.externalId },
      ],
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
      items: [{ externalId: seeded.senadoBill.externalId }],
    });
  });

  it("uses anonymous keys for follows without echoing them", async () => {
    const response = await searchPost(post("/api/projects/search", {
      filters: { followedOnly: true },
      anonymousBillKeys: [
        { source: "camara", externalId: seeded.camaraBill.externalId },
        { source: "camara", externalId: seeded.camaraBill.externalId },
      ],
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      total: 1,
      items: [{ externalId: seeded.camaraBill.externalId }],
    });
    expect(payload).not.toHaveProperty("anonymousBillKeys");
  });

  it("derives an authenticated follow scope from the session instead of client keys", async () => {
    const response = await searchPost(post("/api/projects/search", {
      filters: { followedOnly: true },
      anonymousBillKeys: [{ source: "camara", externalId: seeded.camaraBill.externalId }],
    }, { cookie: `pulso_session=${seeded.session.token}` }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      items: [{ externalId: seeded.senadoBill.externalId }],
    });
  });

  it("accepts twenty repeated filter values and rejects twenty-one", async () => {
    const values = Array.from({ length: 20 }, (_, index) => `Tema ${index}`);
    const accepted = await searchPost(post("/api/projects/search", {
      filters: { topics: values },
    }));
    const rejected = await searchPost(post("/api/projects/search", {
      filters: { topics: [...values, "Tema 20"] },
    }));

    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(400);
  });

  it("enforces text, date, and pagination filter bounds", async () => {
    const accepted = await countPost(post("/api/projects/filter-count", {
      filters: { query: "x".repeat(200), page: 1, pageSize: 50 },
    }));
    expect(accepted.status).toBe(200);

    for (const filters of [
      { query: "x".repeat(201) },
      { presentedStart: "2026-02-30" },
      { page: 0 },
      { page: 100_001 },
      { pageSize: 0 },
      { pageSize: 51 },
    ]) {
      const response = await countPost(post("/api/projects/filter-count", { filters }));
      expect(response.status).toBe(400);
    }
  });

  it("rejects unknown root and bill-reference keys", async () => {
    const root = await countPost(post("/api/projects/filter-count", {
      filters: {},
      unknown: true,
    }));
    const reference = await countPost(post("/api/projects/filter-count", {
      filters: {},
      anonymousBillKeys: [{ source: "camara", externalId: "route-camara", unknown: true }],
    }));

    expect(root.status).toBe(400);
    expect(reference.status).toBe(400);
  });

  it("deduplicates anonymous bill keys before constructing their scope", async () => {
    const parsed = await readPublicFilterRequest(post("/api/projects/search", {
      filters: { followedOnly: true },
      anonymousBillKeys: [
        { source: "camara", externalId: seeded.camaraBill.externalId },
        { source: "camara", externalId: seeded.camaraBill.externalId },
        { source: "senado", externalId: seeded.senadoBill.externalId },
      ],
    }), new UserRepository(testDb));

    expect("scope" in parsed && parsed.scope).toEqual({
      anonymousBillKeys: [
        { source: "camara", externalId: seeded.camaraBill.externalId },
        { source: "senado", externalId: seeded.senadoBill.externalId },
      ],
    });
  });
});
