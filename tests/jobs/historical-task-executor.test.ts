import { describe, expect, it } from "vitest";

import {
  createHistoricalTaskExecutor,
  HistoricalTaskExecutionError,
} from "#/jobs/historical-task-executor";

describe("createHistoricalTaskExecutor", () => {
  it("fails closed while a collection phase has no registered implementation", async () => {
    const executor = createHistoricalTaskExecutor({});

    await expect(executor.execute({ phase: "catalog" } as never)).rejects.toEqual(
      expect.objectContaining<Partial<HistoricalTaskExecutionError>>({
        code: "HISTORICAL_PHASE_NOT_IMPLEMENTED",
        retryable: false,
      }),
    );
  });
});
