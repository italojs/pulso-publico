import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { withAdvisoryLock } from "#/server/db/advisory-lock";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for database integration tests");
}

const lockSql = postgres(process.env.DATABASE_URL, { max: 2 });

afterAll(async () => {
  await lockSql.end({ timeout: 5 });
});

describe("withAdvisoryLock", () => {
  it("skips a second execution while the named job is still running", async () => {
    let enterOperation!: () => void;
    let finishOperation!: () => void;
    const operationStarted = new Promise<void>((resolve) => {
      enterOperation = resolve;
    });
    const operationGate = new Promise<void>((resolve) => {
      finishOperation = resolve;
    });
    const lockName = `test-advisory-lock-${crypto.randomUUID()}`;

    const first = withAdvisoryLock(lockSql, lockName, async () => {
      enterOperation();
      await operationGate;
      return "completed";
    });
    await operationStarted;

    const second = await withAdvisoryLock(lockSql, lockName, async () => "unexpected");
    expect(second).toEqual({ acquired: false });

    finishOperation();
    await expect(first).resolves.toEqual({ acquired: true, value: "completed" });
  });
});
