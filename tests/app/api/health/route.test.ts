import { describe, expect, it } from "vitest";

import { createHealthHandler } from "../../../../app/api/health/route.ts";

const now = new Date("2026-09-03T18:30:00.000Z");

describe("GET /api/health", () => {
  it("reports a degraded status when one official source is stale", async () => {
    const handler = createHealthHandler(
      async () => [
        { source: "camara", lastSuccessAt: new Date("2026-09-03T18:00:00.000Z") },
        { source: "senado", lastSuccessAt: new Date("2026-09-03T14:00:00.000Z") },
      ],
      () => now,
    );

    const response = await handler();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      status: "degraded",
      sources: {
        camara: {
          available: true,
          lastSuccessAt: "2026-09-03T18:00:00.000Z",
        },
        senado: {
          available: false,
          lastSuccessAt: "2026-09-03T14:00:00.000Z",
        },
      },
    });
  });

  it("reports ok only when both sources are fresh", async () => {
    const handler = createHealthHandler(
      async () => [
        { source: "camara", lastSuccessAt: new Date("2026-09-03T18:00:00.000Z") },
        { source: "senado", lastSuccessAt: new Date("2026-09-03T17:30:00.000Z") },
      ],
      () => now,
    );

    expect(await (await handler()).json()).toMatchObject({ status: "ok" });
  });

  it("does not expose local database errors", async () => {
    const handler = createHealthHandler(async () => {
      throw new Error("postgres://secret@database.internal/app");
    });

    const response = await handler();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
