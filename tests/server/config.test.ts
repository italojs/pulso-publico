import { describe, expect, it } from "vitest";
import { isAbsolute } from "node:path";

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
    expect(value.TSE_DATA_BASE_URL).toBe("https://cdn.tse.jus.br");
    expect(value.ELECTION_YEAR).toBe(2026);
    expect(value.GEO_PROVIDER).toBe("none");
    expect(isAbsolute(value.ELECTORAL_MEDIA_DIRECTORY)).toBe(true);
    expect(value.ELECTORAL_MEDIA_DIRECTORY.endsWith("/.data/electoral-assets")).toBe(true);
  });

  it("treats empty optional secrets from an env file as not configured", () => {
    const value = parseEnv({
      DATABASE_URL: "postgres://app:app@localhost:5432/legislativo",
      OPENAI_API_KEY: "",
      OPENAI_MODEL: "",
      VAPID_SUBJECT: "",
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
    });

    expect(value.OPENAI_API_KEY).toBeUndefined();
    expect(value.OPENAI_MODEL).toBeUndefined();
    expect(value.VAPID_SUBJECT).toBeUndefined();
    expect(value.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(value.VAPID_PRIVATE_KEY).toBeUndefined();
  });

  it("rejects an electoral year before 2026 and an unknown geo provider", () => {
    const database = { DATABASE_URL: "postgres://app:app@localhost:5432/legislativo" };
    expect(() => parseEnv({ ...database, ELECTION_YEAR: "2024" })).toThrow(/ELECTION_YEAR/);
    expect(() => parseEnv({ ...database, GEO_PROVIDER: "arbitrary" })).toThrow(/GEO_PROVIDER/);
  });
});
