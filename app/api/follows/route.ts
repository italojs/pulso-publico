import { z } from "zod";

import { currentUser } from "#/auth/current-user";
import { UserRepository } from "#/auth/user-repository";
import { FollowRepository } from "#/follows/follow-repository";
import { db } from "#/server/db/client";

const reference = z.object({
  kind: z.enum(["bill", "lawmaker"]),
  source: z.enum(["camara", "senado"]),
  externalId: z.string().min(1).max(200),
});
const command = z.discriminatedUnion("action", [
  reference.extend({ action: z.literal("follow"), alertsEnabled: z.boolean().optional() }),
  reference.extend({ action: z.literal("unfollow") }),
  z.object({ action: z.literal("sync"), items: z.array(reference).max(200) }),
]);

const users = new UserRepository(db);
const follows = new FollowRepository(db);

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}

export async function GET(request: Request) {
  const user = await currentUser(request, users);
  if (!user) return Response.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  return Response.json({ user: { email: user.email }, items: await follows.list(user.id) });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ code: "CROSS_ORIGIN_REQUEST" }, { status: 403 });
  const user = await currentUser(request, users);
  if (!user) return Response.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  const parsed = command.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "INVALID_FOLLOW_COMMAND" }, { status: 400 });
  if (parsed.data.action === "sync") {
    return Response.json({ synced: await follows.sync(user.id, parsed.data.items) });
  }
  if (parsed.data.action === "unfollow") {
    await follows.unfollow(user.id, parsed.data);
    return Response.json({ followed: false });
  }
  const found = await follows.follow(user.id, parsed.data);
  return found ? Response.json({ followed: true, alertsEnabled: parsed.data.alertsEnabled ?? false }) : Response.json({ code: "FOLLOW_TARGET_NOT_FOUND" }, { status: 404 });
}
