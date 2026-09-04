import { and, eq, gt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { SESSION_TTL_SECONDS, createSessionToken, hashSessionToken } from "#/auth/session";
import { sessions, users } from "#/server/db/schema";
import type * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;

export function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

export class UserRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async createUser(email: string, passwordHash: string) {
    const [user] = await this.database
      .insert(users)
      .values({ email: normalizeEmail(email), passwordHash })
      .returning({ id: users.id, email: users.email, passwordHash: users.passwordHash });
    if (!user) throw new Error("User creation did not return a user");
    return user;
  }

  async findByEmail(email: string) {
    const [user] = await this.database
      .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, normalizeEmail(email)))
      .limit(1);
    return user ?? null;
  }

  async createSession(userId: string, now = new Date(), ttlSeconds = SESSION_TTL_SECONDS) {
    const token = createSessionToken();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1_000);
    await this.database.insert(sessions).values({
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      lastUsedAt: now,
      createdAt: now,
    });
    return { token, expiresAt };
  }

  async findUserBySessionToken(token: string, now = new Date()) {
    const [row] = await this.database
      .select({ id: users.id, email: users.email })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, now)))
      .limit(1);
    return row ?? null;
  }

  async revokeSession(token: string) {
    await this.database.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  }
}
