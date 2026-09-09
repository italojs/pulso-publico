import { setTimeout as delay } from "node:timers/promises";

import { env } from "#/server/config";

export interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
  timeoutMs: number;
}

export interface RetryingRequestInit extends RequestInit {
  retry?: RetryPolicy;
  beforeAttempt?: (signal?: AbortSignal) => Promise<void>;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

export class OfficialSourceError extends Error {
  readonly url: string;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    url: string,
    status: number | null,
    retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OfficialSourceError";
    this.url = url;
    this.status = status;
    this.retryable = retryable;
  }
}

const defaultPolicy: RetryPolicy = {
  attempts: env.HTTP_MAX_ATTEMPTS,
  baseDelayMs: 250,
  timeoutMs: env.HTTP_TIMEOUT_MS,
};

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function assertPolicy(policy: RetryPolicy) {
  if (!Number.isInteger(policy.attempts) || policy.attempts < 1) {
    throw new RangeError("retry.attempts must be a positive integer");
  }
  if (policy.baseDelayMs < 0 || policy.timeoutMs <= 0) {
    throw new RangeError("retry delays must be non-negative and timeout must be positive");
  }
}

export async function retryingFetch(
  url: URL,
  init: RetryingRequestInit = {},
): Promise<Response> {
  const {
    retry = defaultPolicy,
    signal: callerSignal,
    beforeAttempt,
    sleep = async (milliseconds, signal) => {
      await delay(milliseconds, undefined, { signal });
    },
    random = Math.random,
    ...requestInit
  } = init;
  assertPolicy(retry);

  for (let attempt = 1; attempt <= retry.attempts; attempt += 1) {
    await beforeAttempt?.(callerSignal ?? undefined);
    const timeoutController = new AbortController();
    const timeout = setTimeout(
      () => timeoutController.abort(new DOMException("Request timed out", "TimeoutError")),
      retry.timeoutMs,
    );
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutController.signal])
      : timeoutController.signal;

    let retryAfterMs = 0;
    try {
      const response = await fetch(url, { ...requestInit, signal });
      if (response.ok) {
        return response;
      }

      const retryable = isRetryableStatus(response.status);
      retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
      await response.body?.cancel().catch(() => undefined);
      if (!retryable || attempt === retry.attempts) {
        throw new OfficialSourceError(
          `Official source request failed with status ${response.status}`,
          url.href,
          response.status,
          retryable,
        );
      }
    } catch (error) {
      if (error instanceof OfficialSourceError) {
        throw error;
      }

      if (callerSignal?.aborted) {
        throw new OfficialSourceError(
          "Official source request was cancelled",
          url.href,
          null,
          false,
        );
      }

      if (attempt === retry.attempts) {
        throw new OfficialSourceError(
          `Official source request failed after ${attempt} attempts`,
          url.href,
          null,
          true,
          { cause: error },
        );
      }
    } finally {
      clearTimeout(timeout);
    }

    const cappedBackoffMs = Math.min(30_000, retry.baseDelayMs * 2 ** (attempt - 1));
    const jitteredBackoffMs = cappedBackoffMs * (0.5 + random() * 0.5);
    const waitMs = Math.max(retryAfterMs, jitteredBackoffMs);
    if (waitMs > 0) {
      await sleep(waitMs, callerSignal ?? undefined);
    }
  }

  throw new Error("unreachable retry state");
}

function parseRetryAfter(value: string | null) {
  if (!value) {
    return 0;
  }

  const deltaSeconds = Number(value);
  if (Number.isFinite(deltaSeconds) && deltaSeconds >= 0) {
    return deltaSeconds * 1_000;
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) {
    return 0;
  }
  return Math.max(0, retryAt - Date.now());
}
