import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "#/auth/password";
import { createSessionToken, hashSessionToken, readSessionToken } from "#/auth/session";

describe("account credentials", () => {
  it("normalizes and verifies a password using a salted scrypt hash", async () => {
    const stored = await hashPassword("uma senha longa e segura");

    expect(stored).toMatch(/^scrypt\$/);
    await expect(verifyPassword("uma senha longa e segura", stored)).resolves.toBe(true);
    await expect(verifyPassword("senha incorreta", stored)).resolves.toBe(false);
  });

  it("rejects malformed stored password data", async () => {
    await expect(verifyPassword("qualquer senha", "texto-invalido")).resolves.toBe(false);
  });

  it("creates an opaque token and stores a deterministic one-way digest", () => {
    const token = createSessionToken();

    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashSessionToken(token)).toHaveLength(64);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("reads only the exact session cookie", () => {
    expect(readSessionToken("outro=1; pulso_session=abc%20123; tema=claro")).toBe("abc 123");
    expect(readSessionToken("pulso_session_extra=abc")).toBeNull();
  });
});
