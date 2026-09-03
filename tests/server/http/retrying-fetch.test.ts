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
});
