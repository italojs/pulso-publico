import { describe, expect, it } from "vitest";

import { GET } from "../../../../app/api/live/route.ts";

describe("GET /api/live", () => {
  it("reports that the HTTP process is alive without checking dependencies", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
