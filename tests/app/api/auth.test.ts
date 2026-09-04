import { describe, expect, it, vi } from "vitest";

import { hashPassword } from "#/auth/password";
import { createLoginHandler, createLogoutHandler, createRegisterHandler } from "#/auth/http";

function formRequest(path: string, values: Record<string, string>, origin = "https://app.example") {
  return new Request(`https://app.example${path}`, {
    method: "POST",
    headers: { origin },
    body: new URLSearchParams(values),
  });
}

describe("auth HTTP handlers", () => {
  it("registers a valid account and creates a secure session cookie", async () => {
    const repository = {
      createUser: vi.fn().mockResolvedValue({ id: "user-1", email: "pessoa@example.com" }),
      createSession: vi.fn().mockResolvedValue({ token: "opaque-token", expiresAt: new Date() }),
    };
    const response = await createRegisterHandler(repository)(formRequest("/api/auth/register", {
      email: " Pessoa@Example.com ",
      password: "uma senha bastante segura",
      next: "/seguindo",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example/seguindo?conta=criada");
    expect(response.headers.get("set-cookie")).toContain("pulso_session=opaque-token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("uses a generic login error for an unknown account", async () => {
    const repository = {
      findByEmail: vi.fn().mockResolvedValue(null),
      createSession: vi.fn(),
    };
    const response = await createLoginHandler(repository)(formRequest("/api/auth/login", {
      email: "unknown@example.com",
      password: "uma senha bastante segura",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/entrar?erro=credenciais");
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it("logs in a valid account and rejects an external redirect", async () => {
    const repository = {
      findByEmail: vi.fn().mockResolvedValue({
        id: "user-1",
        email: "pessoa@example.com",
        passwordHash: await hashPassword("uma senha bastante segura"),
      }),
      createSession: vi.fn().mockResolvedValue({ token: "opaque-token", expiresAt: new Date() }),
    };
    const response = await createLoginHandler(repository)(formRequest("/api/auth/login", {
      email: "pessoa@example.com",
      password: "uma senha bastante segura",
      next: "//evil.example/path",
    }));

    expect(response.headers.get("location")).toBe("https://app.example/seguindo");
  });

  it("rejects a cross-origin form submission", async () => {
    const repository = { findByEmail: vi.fn(), createSession: vi.fn() };
    const response = await createLoginHandler(repository)(formRequest("/api/auth/login", {
      email: "pessoa@example.com",
      password: "uma senha bastante segura",
    }, "https://evil.example"));

    expect(response.status).toBe(403);
    expect(repository.findByEmail).not.toHaveBeenCalled();
  });

  it("revokes the current cookie on logout", async () => {
    const repository = { revokeSession: vi.fn().mockResolvedValue(undefined) };
    const request = new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: "pulso_session=current-token" },
    });
    const response = await createLogoutHandler(repository)(request);

    expect(repository.revokeSession).toHaveBeenCalledWith("current-token");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
