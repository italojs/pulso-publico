import { z } from "zod";

import { currentUser } from "#/auth/current-user";
import { UserRepository } from "#/auth/user-repository";
import { FollowRepository } from "#/follows/follow-repository";
import { db } from "#/server/db/client";
import { sameOrigin } from "#/server/http/request-origin";

const legislativeReference = z.object({
  kind: z.enum(["bill", "lawmaker"]),
  source: z.enum(["camara", "senado"]),
  externalId: z.string().min(1).max(200),
}).strict();
const candidateReference = z.object({
  kind: z.literal("candidate"),
  electionYear: z.number().int().min(2026).max(9999),
  externalId: z.string().regex(/^\d{1,30}$/),
}).strict();
const command = z.union([
  legislativeReference.extend({ action: z.literal("follow"), alertsEnabled: z.boolean().optional() }).strict(),
  legislativeReference.extend({ action: z.literal("unfollow") }).strict(),
  candidateReference.extend({ action: z.literal("follow") }).strict(),
  candidateReference.extend({ action: z.literal("unfollow") }).strict(),
  z.object({ action: z.literal("sync"), items: z.array(legislativeReference).max(200) }).strict(),
]);

const users = new UserRepository(db);
const follows = new FollowRepository(db);

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
  const { action: _action, ...reference } = parsed.data;
  if (parsed.data.action === "unfollow") {
    await follows.unfollow(user.id, reference);
    return Response.json({ followed: false });
  }
  const found = await follows.follow(user.id, reference);
  if (!found) return Response.json({ code: "FOLLOW_TARGET_NOT_FOUND" }, { status: 404 });
  return parsed.data.kind === "candidate"
    ? Response.json({ followed: true })
    : Response.json({ followed: true, alertsEnabled: parsed.data.alertsEnabled ?? false });
}
