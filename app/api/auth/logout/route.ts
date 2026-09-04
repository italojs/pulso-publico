import { createLogoutHandler } from "#/auth/http";
import { UserRepository } from "#/auth/user-repository";
import { db } from "#/server/db/client";

export const POST = createLogoutHandler(new UserRepository(db));
