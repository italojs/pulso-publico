import { readSessionToken } from "#/auth/session";
import type { UserRepository } from "#/auth/user-repository";

export async function currentUser(request: Request, repository: UserRepository) {
  const token = readSessionToken(request.headers.get("cookie"));
  return token ? repository.findUserBySessionToken(token) : null;
}
