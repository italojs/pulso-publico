import { readSessionToken } from "#/auth/session";
import type { UserRepository } from "#/auth/user-repository";

export async function currentUserFromCookie(cookieHeader: string | null, repository: UserRepository) {
  const token = readSessionToken(cookieHeader);
  return token ? repository.findUserBySessionToken(token) : null;
}

export async function currentUser(request: Request, repository: UserRepository) {
  return currentUserFromCookie(request.headers.get("cookie"), repository);
}
