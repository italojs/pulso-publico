import { setTimeout as delay } from "node:timers/promises";

import {
  retryingFetch,
  type RetryingRequestInit,
  type RetryPolicy,
} from "#/server/http/retrying-fetch";

type Sleeper = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

export interface RequestGovernorOptions {
  minimumIntervalMs: number;
  now?: () => number;
  sleep?: Sleeper;
}

const defaultSleep: Sleeper = async (milliseconds, signal) => {
  await delay(milliseconds, undefined, { signal });
};

export class RequestGovernor {
  private readonly minimumIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: Sleeper;
  private nextStartAt = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(options: RequestGovernorOptions) {
    if (!Number.isFinite(options.minimumIntervalMs) || options.minimumIntervalMs < 0) {
      throw new RangeError("minimumIntervalMs must be a non-negative number");
    }
    this.minimumIntervalMs = options.minimumIntervalMs;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  waitTurn(signal?: AbortSignal): Promise<void> {
    const turn = this.tail.then(async () => {
      signal?.throwIfAborted();
      const waitMs = Math.max(0, this.nextStartAt - this.now());
      if (waitMs > 0) {
        await this.sleep(waitMs, signal);
      }
      signal?.throwIfAborted();
      this.nextStartAt = this.now() + this.minimumIntervalMs;
    });

    this.tail = turn.catch(() => undefined);
    return turn;
  }
}

export function createGovernedFetcher(options: {
  minimumIntervalMs: number;
  retryPolicy?: RetryPolicy;
}) {
  const governor = new RequestGovernor({ minimumIntervalMs: options.minimumIntervalMs });

  return async (url: URL, init: RetryingRequestInit = {}) => {
    const callerBeforeAttempt = init.beforeAttempt;
    return retryingFetch(url, {
      ...init,
      retry: init.retry ?? options.retryPolicy,
      beforeAttempt: async (signal) => {
        await governor.waitTurn(signal);
        await callerBeforeAttempt?.(signal);
      },
    });
  };
}
