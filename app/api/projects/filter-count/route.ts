import { UserRepository } from "#/auth/user-repository";
import { db } from "#/server/db/client";
import { sameOrigin } from "#/server/http/request-origin";
import { readPublicFilterRequest } from "#/server/public/filter-contract";
import { countPublicBills } from "#/server/public/queries";

const users = new UserRepository(db);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ code: "CROSS_ORIGIN_REQUEST" }, { status: 403 });

  const parsed = await readPublicFilterRequest(request, users);
  if ("error" in parsed) {
    return Response.json({ code: parsed.error }, { status: parsed.error === "REQUEST_TOO_LARGE" ? 413 : 400 });
  }

  return Response.json({ total: await countPublicBills(db, parsed.filters, parsed.scope) });
}
