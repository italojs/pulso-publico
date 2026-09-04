import { describe, expect, it } from "vitest";

import { isSecureRequest, publicOrigin, sameOrigin } from "#/server/http/request-origin";

describe("public request origin", () => {
  it("uses the browser-facing host when the framework URL has an internal host", () => {
    const request = new Request("http://localhost:3000/api/example", {
      headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    });

    expect(publicOrigin(request)).toBe("http://127.0.0.1:3000");
    expect(sameOrigin(request)).toBe(true);
  });

  it("respects reverse-proxy host and protocol headers", () => {
    const request = new Request("http://internal:3000/api/example", {
      headers: {
        host: "internal:3000",
        origin: "https://pulso.example",
        "x-forwarded-host": "pulso.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(publicOrigin(request)).toBe("https://pulso.example");
    expect(isSecureRequest(request)).toBe(true);
  });

  it("rejects a different browser origin", () => {
    const request = new Request("https://pulso.example/api/example", {
      headers: { origin: "https://evil.example" },
    });

    expect(sameOrigin(request)).toBe(false);
  });
});
