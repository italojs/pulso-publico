import { z } from "zod";

import { hashPassword, verifyPassword } from "#/auth/password";
import { expiredSessionCookie, readSessionToken, sessionCookie } from "#/auth/session";
import { normalizeEmail } from "#/auth/user-repository";
import { isSecureRequest, publicOrigin, sameOrigin } from "#/server/http/request-origin";

interface RegistrationRepository {
  createUser(email: string, passwordHash: string): Promise<{ id: string; email: string }>;
  createSession(userId: string): Promise<{ token: string; expiresAt: Date }>;
}

interface LoginRepository {
  findByEmail(email: string): Promise<{ id: string; email: string; passwordHash: string } | null>;
  createSession(userId: string): Promise<{ token: string; expiresAt: Date }>;
}

interface LogoutRepository {
  revokeSession(token: string): Promise<void>;
}

const credentials = z.object({
  email: z.email().max(320),
  password: z.string().min(10).max(512),
  next: z.string().optional(),
});

function safePath(value: string | undefined, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function appendStatus(path: string, key: string, value: string) {
  const url = new URL(path, "https://internal.invalid");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function redirect(request: Request, path: string, cookie?: string) {
  const headers = new Headers({ Location: new URL(path, publicOrigin(request)).toString() });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

async function formValues(request: Request) {
  const form = await request.formData();
  return credentials.safeParse({
    email: normalizeEmail(String(form.get("email") ?? "")),
    password: String(form.get("password") ?? ""),
    next: form.get("next") ? String(form.get("next")) : undefined,
  });
}

function uniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && Reflect.get(error, "code") === "23505");
}

export function createRegisterHandler(repository: RegistrationRepository) {
  return async function POST(request: Request) {
    if (!sameOrigin(request)) return Response.json({ code: "CROSS_ORIGIN_REQUEST" }, { status: 403 });
    const parsed = await formValues(request);
    if (!parsed.success) return redirect(request, "/cadastro?erro=dados");
    try {
      const user = await repository.createUser(parsed.data.email, await hashPassword(parsed.data.password));
      const session = await repository.createSession(user.id);
      const destination = appendStatus(safePath(parsed.data.next, "/seguindo"), "conta", "criada");
      return redirect(request, destination, sessionCookie(session.token, isSecureRequest(request)));
    } catch (error) {
      if (uniqueViolation(error)) return redirect(request, "/cadastro?erro=email");
      return Response.json({ code: "ACCOUNT_CREATION_FAILED" }, { status: 503 });
    }
  };
}

export function createLoginHandler(repository: LoginRepository) {
  return async function POST(request: Request) {
    if (!sameOrigin(request)) return Response.json({ code: "CROSS_ORIGIN_REQUEST" }, { status: 403 });
    const parsed = await formValues(request);
    if (!parsed.success) return redirect(request, "/entrar?erro=credenciais");
    const user = await repository.findByEmail(parsed.data.email);
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return redirect(request, "/entrar?erro=credenciais");
    }
    const session = await repository.createSession(user.id);
    return redirect(
      request,
      safePath(parsed.data.next, "/seguindo"),
      sessionCookie(session.token, isSecureRequest(request)),
    );
  };
}

export function createLogoutHandler(repository: LogoutRepository) {
  return async function POST(request: Request) {
    if (!sameOrigin(request)) return Response.json({ code: "CROSS_ORIGIN_REQUEST" }, { status: 403 });
    const token = readSessionToken(request.headers.get("cookie"));
    if (token) await repository.revokeSession(token);
    return redirect(request, "/", expiredSessionCookie(isSecureRequest(request)));
  };
}
