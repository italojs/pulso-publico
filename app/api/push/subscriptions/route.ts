import { z } from "zod";

import { WebPushProvider } from "#/alerts/push-provider";
import { PushRepository } from "#/alerts/push-repository";
import { currentUser } from "#/auth/current-user";
import { UserRepository } from "#/auth/user-repository";
import { env } from "#/server/config";
import { db } from "#/server/db/client";

const subscribe = z.object({ action: z.literal("subscribe"), subscription: z.object({ endpoint: z.url().max(2048), expirationTime: z.number().nullable().optional(), keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }) }) });
const unsubscribe = z.object({ action: z.literal("unsubscribe"), endpoint: z.url().max(2048) });
const command = z.discriminatedUnion("action", [subscribe, unsubscribe]);
const users = new UserRepository(db);
const pushes = new PushRepository(db);
const provider = new WebPushProvider({ subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}

export async function GET(request: Request) {
  const user = await currentUser(request, users);
  if (!user) return Response.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  return Response.json({ available: provider.available, publicKey: provider.available ? env.VAPID_PUBLIC_KEY : null });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ code: "CROSS_ORIGIN_REQUEST" }, { status: 403 });
  const user = await currentUser(request, users);
  if (!user) return Response.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  const parsed = command.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "INVALID_PUSH_SUBSCRIPTION" }, { status: 400 });
  if (parsed.data.action === "unsubscribe") await pushes.removeSubscription(user.id, parsed.data.endpoint);
  else await pushes.saveSubscription(user.id, parsed.data.subscription);
  return Response.json({ ok: true });
}
