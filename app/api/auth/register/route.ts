import { createRegisterHandler } from "#/auth/http";
import { UserRepository } from "#/auth/user-repository";
import { db } from "#/server/db/client";

export const POST = createRegisterHandler(new UserRepository(db));
