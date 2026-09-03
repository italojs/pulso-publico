import { setTimeout as delay } from "node:timers/promises";

import { env } from "#/server/config";

export interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
  timeoutMs: number;
}

export interface RetryingRequestInit extends RequestInit {
  retry?: RetryPolicy;
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
  const { retry = defaultPolicy, signal: callerSignal, ...requestInit } = init;
  assertPolicy(retry);

  for (let attempt = 1; attempt <= retry.attempts; attempt += 1) {
    const timeoutSignal = AbortSignal.timeout(retry.timeoutMs);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutSignal])
      : timeoutSignal;

    try {
      const response = await fetch(url, { ...requestInit, signal });
      if (response.ok) {
        return response;
      }

      const retryable = isRetryableStatus(response.status);
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
    }

    const backoffMs = retry.baseDelayMs * 2 ** (attempt - 1);
    if (backoffMs > 0) {
      await delay(backoffMs, undefined, { signal: callerSignal ?? undefined });
    }
  }

  throw new Error("unreachable retry state");
}
