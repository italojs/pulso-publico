import { UserRepository } from "#/auth/user-repository";
import { readCandidateFilterRequest } from "#/server/candidates/filter-contract";
import { countCandidates } from "#/server/candidates/queries";
import { db } from "#/server/db/client";
import { sameOrigin } from "#/server/http/request-origin";

const users = new UserRepository(db);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ code: "CROSS_ORIGIN_REQUEST" }, { status: 403 });
  const parsed = await readCandidateFilterRequest(request, users);
  if ("error" in parsed) {
    const status = parsed.error === "AUTH_REQUIRED"
      ? 401
      : parsed.error === "REQUEST_TOO_LARGE"
        ? 413
        : 400;
    return Response.json({ code: parsed.error }, { status });
  }
  return Response.json({ total: await countCandidates(db, parsed.filters, parsed.scope) });
}
