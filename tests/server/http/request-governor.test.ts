import { describe, expect, it } from "vitest";

import { RequestGovernor } from "#/server/http/request-governor";

describe("RequestGovernor", () => {
  it("serializes concurrent request starts at the configured interval", async () => {
    const starts: number[] = [];
    let now = 0;
    const governor = new RequestGovernor({
      minimumIntervalMs: 3_000,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
    });

    await Promise.all([
      governor.waitTurn().then(() => starts.push(now)),
      governor.waitTurn().then(() => starts.push(now)),
      governor.waitTurn().then(() => starts.push(now)),
    ]);

    expect(starts).toEqual([0, 3_000, 6_000]);
  });

  it("schedules from the actual start and never creates a catch-up burst", async () => {
    let now = 0;
    const governor = new RequestGovernor({
      minimumIntervalMs: 3_000,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
    });

    await governor.waitTurn();
    now = 10_000;
    await governor.waitTurn();
    expect(now).toBe(10_000);

    await governor.waitTurn();
    expect(now).toBe(13_000);
  });
});
