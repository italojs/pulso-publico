import { describe, expect, it, vi } from "vitest";

import { inferRegion } from "#/server/candidates/inferred-region";

const BRAZILIAN_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

describe("trusted candidate-region inference", () => {
  it.each(BRAZILIAN_UFS)("accepts the Brazilian UF %s from the configured Cloudflare header", (region) => {
    expect(inferRegion(new Headers({ "cf-region-code": region }), "cloudflare")).toBe(region);
  });

  it("normalizes case and surrounding whitespace from the trusted provider", () => {
    expect(inferRegion(new Headers({ "x-vercel-ip-country-region": "  es  " }), "vercel")).toBe("ES");
  });

  it("ignores valid-looking region headers from a provider that was not configured", () => {
    const headers = new Headers({
      "cf-region-code": "ES",
      "x-vercel-ip-country-region": "SP",
    });

    expect(inferRegion(headers, "cloudflare")).toBe("ES");
    expect(inferRegion(headers, "vercel")).toBe("SP");
    expect(inferRegion(new Headers({ "x-vercel-ip-country-region": "SP" }), "cloudflare"))
      .toBeUndefined();
    expect(inferRegion(new Headers({ "cf-region-code": "ES" }), "vercel"))
      .toBeUndefined();
  });

  it.each(["BR", "ZZ", "../../etc", "ES, SP", "", "E S"])(
    "rejects malformed or non-UF provider value %j",
    (region) => {
      expect(inferRegion(new Headers({ "cf-region-code": region }), "cloudflare")).toBeUndefined();
    },
  );

  it("does not read any header when geolocation is disabled", () => {
    const get = vi.fn(() => "ES");

    expect(inferRegion({ get } as unknown as Headers, "none")).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });
});
