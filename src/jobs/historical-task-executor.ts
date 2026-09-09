import type {
  HistoricalPhase,
  HistoricalTask,
} from "#/domain/historical-collection";
import type { DatabaseTransaction } from "#/server/historical/task-repository";

interface HistoricalTaskBatchBase {
  read: number;
  persisted: number;
  persist(transaction: DatabaseTransaction): Promise<void>;
}

export interface HistoricalProgressBatch extends HistoricalTaskBatchBase {
  outcome: "progress";
  cursor: string;
}

export interface HistoricalCompleteBatch extends HistoricalTaskBatchBase {
  outcome: "complete";
}

export type HistoricalTaskBatch = HistoricalProgressBatch | HistoricalCompleteBatch;

export interface HistoricalTaskExecutor {
  execute(task: HistoricalTask, signal?: AbortSignal): Promise<HistoricalTaskBatch>;
}

export class HistoricalTaskExecutionError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean, options?: ErrorOptions) {
    super(code, options);
    this.name = "HistoricalTaskExecutionError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type HistoricalPhaseHandler = (
  task: HistoricalTask,
  signal?: AbortSignal,
) => Promise<HistoricalTaskBatch>;

export function createHistoricalTaskExecutor(
  handlers: Partial<Record<HistoricalPhase, HistoricalPhaseHandler>>,
): HistoricalTaskExecutor {
  return {
    async execute(task, signal) {
      const handler = handlers[task.phase];
      if (!handler) {
        throw new HistoricalTaskExecutionError(
          "HISTORICAL_PHASE_NOT_IMPLEMENTED",
          false,
        );
      }
      return handler(task, signal);
    },
  };
}
