import { describe, expect, it } from "vitest";

describe("disposable development databases", () => {
  async function validate(value: string, purpose: "test" | "demo" | "test_demo") {
    const { assertLocalDisposableDatabaseUrl } = await import("#/development/database-url");
    return assertLocalDisposableDatabaseUrl(value, purpose);
  }

  it.each([
    ["postgres://app:app@127.0.0.1:5435/legislativo_test", "test"],
    ["postgresql://app:app@localhost:5435/legislativo_demo", "demo"],
    ["postgres://app:app@[::1]:5435/pulso_test", "test"],
  ] as const)("accepts a loopback %s database", async (value, purpose) => {
    await expect(validate(value, purpose)).resolves.toBe(value);
  });

  it.each([
    "postgres://app:app@127.0.0.1:5435/legislativo",
    "postgres://app:app@db.example.invalid:5432/legislativo_test",
    "postgres://app:app@127.0.0.1:5435/legislativo_demo",
    "postgres://app:app@127.0.0.1:5435/legislativo_test?host=db.example.invalid",
    "https://localhost/legislativo_test",
    "not a URL",
    "",
  ])("rejects unsafe test targets without exposing the URL", async (value) => {
    await expect(validate(value, "test")).rejects.toThrow("local disposable");
  });

  it("does not expose credentials in rejection messages", async () => {
    const value = "postgres://sensitive-user:sensitive-password@remote.invalid/production";
    try {
      await validate(value, "demo");
      expect.fail("unsafe target was accepted");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/sensitive-user|sensitive-password|remote\.invalid/);
    }
  });

  it("isolates demo regression tests from the interactive demo database", async () => {
    await expect(validate("postgres://app:app@127.0.0.1:5435/legislativo_test_demo", "test_demo"))
      .resolves.toContain("legislativo_test_demo");
    await expect(validate("postgres://app:app@127.0.0.1:5435/legislativo_demo", "test_demo"))
      .rejects.toThrow("_test_demo");
  });

  it("recognizes synthetic records only inside a local demo database", async () => {
    const { isLocalDemoRecord } = await import("#/development/database-url");
    expect(isLocalDemoRecord("postgres://app:app@localhost:5435/legislativo_demo", "demo-001")).toBe(true);
    expect(isLocalDemoRecord("postgres://app:app@localhost:5435/legislativo", "demo-001")).toBe(false);
    expect(isLocalDemoRecord("postgres://app:app@remote.invalid/legislativo_demo", "demo-001")).toBe(false);
    expect(isLocalDemoRecord("postgres://app:app@localhost:5435/legislativo_demo", "123456")).toBe(false);
  });
});
