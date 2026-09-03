import { describe, expect, it } from "vitest";

import { parseEnv } from "#/server/config";

describe("parseEnv", () => {
  it("rejects an absent database URL", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("supplies safe official-source defaults", () => {
    const value = parseEnv({
      DATABASE_URL: "postgres://app:app@localhost:5432/legislativo",
    });

    expect(value.CAMARA_BASE_URL).toBe("https://dadosabertos.camara.leg.br/api/v2");
    expect(value.SENADO_BASE_URL).toBe("https://legis.senado.leg.br/dadosabertos");
    expect(value.HTTP_TIMEOUT_MS).toBe(10_000);
    expect(value.HTTP_MAX_ATTEMPTS).toBe(3);
    expect(value.INITIAL_HISTORY_MONTHS).toBe(36);
  });
});
