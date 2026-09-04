import { z } from "zod";

import { AlertRepository } from "#/alerts/alert-repository";
import { currentUser } from "#/auth/current-user";
import { UserRepository } from "#/auth/user-repository";
import { db } from "#/server/db/client";
import { sameOrigin } from "#/server/http/request-origin";

const command = z.object({ action: z.literal("read"), id: z.union([z.uuid(), z.literal("all")]) });
const users = new UserRepository(db);
const alerts = new AlertRepository(db);

export async function GET(request: Request) {
  const user = await currentUser(request, users);
  if (!user) return Response.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  const items = await alerts.listForUser(user.id);
  return Response.json({ user: { email: user.email }, unread: items.filter((item) => !item.readAt).length, items });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ code: "CROSS_ORIGIN_REQUEST" }, { status: 403 });
  const user = await currentUser(request, users);
  if (!user) return Response.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  const parsed = command.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "INVALID_ALERT_COMMAND" }, { status: 400 });
  await alerts.markRead(user.id, parsed.data.id === "all" ? null : parsed.data.id);
  return Response.json({ ok: true });
}
