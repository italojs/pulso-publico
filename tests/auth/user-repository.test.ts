import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { UserRepository, normalizeEmail } from "#/auth/user-repository";
import { hashPassword } from "#/auth/password";
import { migrateTestDatabase, testDb, testSql, truncateLegislativeTables } from "../setup-database.ts";

beforeAll(migrateTestDatabase);
beforeEach(truncateLegislativeTables);
afterAll(() => testSql.end());

describe("user repository", () => {
  it("normalizes e-mail without changing internal characters", () => {
    expect(normalizeEmail("  Pessoa.Exemplo@EMAIL.com  ")).toBe("pessoa.exemplo@email.com");
  });

  it("creates, resolves and revokes an opaque session", async () => {
    const repository = new UserRepository(testDb);
    const user = await repository.createUser("Pessoa@Example.com", await hashPassword("uma senha bastante segura"));
    const session = await repository.createSession(user.id, new Date("2026-09-03T12:00:00Z"));

    expect(session.token).not.toContain(user.id);
    await expect(repository.findUserBySessionToken(session.token, new Date("2026-09-03T12:01:00Z"))).resolves.toMatchObject({
      id: user.id,
      email: "pessoa@example.com",
    });
    await repository.revokeSession(session.token);
    await expect(repository.findUserBySessionToken(session.token)).resolves.toBeNull();
  });

  it("does not resolve an expired session", async () => {
    const repository = new UserRepository(testDb);
    const user = await repository.createUser("pessoa@example.com", await hashPassword("uma senha bastante segura"));
    const session = await repository.createSession(user.id, new Date("2026-01-01T00:00:00Z"), 10);

    await expect(repository.findUserBySessionToken(session.token, new Date("2026-01-01T00:00:11Z"))).resolves.toBeNull();
  });
});
