import { afterEach, describe, expect, it, vi } from "vitest";

import { OfficialSourceError, retryingFetch } from "#/server/http/retrying-fetch";

describe("retryingFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries a temporary upstream failure", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await retryingFetch(new URL("https://example.test/items"), {
      retry: { attempts: 3, baseDelayMs: 0, timeoutMs: 100 },
    });

    expect(await response.text()).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent response", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("missing", { status: 404 }));

    const result = retryingFetch(new URL("https://example.test/missing"), {
      retry: { attempts: 3, baseDelayMs: 0, timeoutMs: 100 },
    });

    await expect(result).rejects.toMatchObject({
      name: "OfficialSourceError",
      status: 404,
      retryable: false,
      url: "https://example.test/missing",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("bounds network retries and exposes no response body", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("socket closed"));

    const result = retryingFetch(new URL("https://example.test/private-payload"), {
      retry: { attempts: 3, baseDelayMs: 0, timeoutMs: 100 },
    });

    const error = await result.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(OfficialSourceError);
    expect(error).toMatchObject({
      status: null,
      retryable: true,
      url: "https://example.test/private-payload",
    });
    expect(String(error)).not.toContain("socket closed");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not abort a successful response body after its headers arrive", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const signal = init?.signal;
      return new Response(new ReadableStream({
        start(controller) {
          const timer = setTimeout(() => {
            controller.enqueue(new TextEncoder().encode("stream concluído"));
            controller.close();
          }, 30);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            controller.error(signal.reason);
          }, { once: true });
        },
      }));
    });

    const response = await retryingFetch(new URL("https://example.test/stream"), {
      retry: { attempts: 1, baseDelayMs: 0, timeoutMs: 10 },
    });

    await expect(response.text()).resolves.toBe("stream concluído");
  });

  it("respects a Retry-After delta longer than the exponential backoff", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("busy", {
        status: 429,
        headers: { "Retry-After": "7" },
      }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const sleep = vi.fn(async () => undefined);

    const response = await retryingFetch(new URL("https://example.test/items"), {
      retry: { attempts: 2, baseDelayMs: 250, timeoutMs: 100 },
      sleep,
      random: () => 0,
    });

    expect(await response.text()).toBe("ok");
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(7_000, undefined);
  });

  it("respects a Retry-After HTTP date", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-09T12:00:00.000Z"));
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("busy", {
        status: 503,
        headers: { "Retry-After": "Wed, 09 Sep 2026 12:00:05 GMT" },
      }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const sleep = vi.fn(async () => undefined);

    await retryingFetch(new URL("https://example.test/items"), {
      retry: { attempts: 2, baseDelayMs: 0, timeoutMs: 100 },
      sleep,
    });

    expect(sleep).toHaveBeenCalledWith(5_000, undefined);
  });
});
