import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  follow: vi.fn(),
  list: vi.fn(),
  sync: vi.fn(),
  unfollow: vi.fn(),
}));

vi.mock("#/auth/current-user", () => ({ currentUser: mocks.currentUser }));
vi.mock("#/auth/user-repository", () => ({ UserRepository: class UserRepository {} }));
vi.mock("#/server/db/client", () => ({ db: { kind: "follow-api-test-db" } }));
vi.mock("#/follows/follow-repository", () => ({
  FollowRepository: class FollowRepository {
    follow = mocks.follow;
    list = mocks.list;
    sync = mocks.sync;
    unfollow = mocks.unfollow;
  },
}));

import { GET, POST } from "../../../app/api/follows/route.ts";

function followRequest(body: unknown, origin = "https://app.example") {
  return new Request("https://app.example/api/follows", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify(body),
  });
}

describe("follow API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "user-1", email: "ana@example.com" });
    mocks.follow.mockResolvedValue(true);
    mocks.list.mockResolvedValue([]);
    mocks.sync.mockResolvedValue(0);
    mocks.unfollow.mockResolvedValue(undefined);
  });

  it("accepts strict candidate follow and unfollow commands without legislative or alert fields", async () => {
    const follow = await POST(followRequest({
      action: "follow",
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001234567",
    }));
    expect(follow.status).toBe(200);
    await expect(follow.json()).resolves.toEqual({ followed: true });
    expect(mocks.follow).toHaveBeenCalledWith("user-1", {
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001234567",
    });

    const unfollow = await POST(followRequest({
      action: "unfollow",
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001234567",
    }));
    expect(unfollow.status).toBe(200);
    await expect(unfollow.json()).resolves.toEqual({ followed: false });
    expect(mocks.unfollow).toHaveBeenCalledWith("user-1", {
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001234567",
    });
  });

  it.each([
    ["candidate source hybrid", { action: "follow", kind: "candidate", electionYear: 2026, externalId: "260001", source: "camara" }],
    ["candidate alerts hybrid", { action: "follow", kind: "candidate", electionYear: 2026, externalId: "260001", alertsEnabled: true }],
    ["candidate unknown key", { action: "unfollow", kind: "candidate", electionYear: 2026, externalId: "260001", label: "Ana" }],
    ["candidate year below range", { action: "follow", kind: "candidate", electionYear: 2025, externalId: "260001" }],
    ["candidate year above range", { action: "follow", kind: "candidate", electionYear: 10_000, externalId: "260001" }],
    ["candidate fractional year", { action: "follow", kind: "candidate", electionYear: 2026.5, externalId: "260001" }],
    ["candidate empty ID", { action: "follow", kind: "candidate", electionYear: 2026, externalId: "" }],
    ["candidate oversized ID", { action: "follow", kind: "candidate", electionYear: 2026, externalId: "1".repeat(31) }],
    ["candidate non-TSE ID", { action: "follow", kind: "candidate", electionYear: 2026, externalId: "candidate-1" }],
    ["bill missing source", { action: "follow", kind: "bill", externalId: "501" }],
    ["bill year hybrid", { action: "follow", kind: "bill", source: "camara", electionYear: 2026, externalId: "501" }],
    ["legacy unknown key", { action: "unfollow", kind: "lawmaker", source: "senado", externalId: "12", provider: "senado" }],
    ["candidate in legacy sync", { action: "sync", items: [{ kind: "candidate", electionYear: 2026, externalId: "260001" }] }],
    ["hybrid candidate in legacy sync", { action: "sync", items: [{ kind: "candidate", source: "camara", electionYear: 2026, externalId: "260001" }] }],
  ])("rejects %s", async (_name, body) => {
    const response = await POST(followRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "INVALID_FOLLOW_COMMAND" });
    expect(mocks.follow).not.toHaveBeenCalled();
    expect(mocks.unfollow).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("preserves same-origin and authentication checks", async () => {
    const crossOrigin = await POST(followRequest({
      action: "follow", kind: "candidate", electionYear: 2026, externalId: "260001",
    }, "https://evil.example"));
    expect(crossOrigin.status).toBe(403);
    expect(mocks.follow).not.toHaveBeenCalled();

    mocks.currentUser.mockResolvedValueOnce(null);
    const anonymous = await POST(followRequest({
      action: "follow", kind: "candidate", electionYear: 2026, externalId: "260001",
    }));
    expect(anonymous.status).toBe(401);
    await expect(anonymous.json()).resolves.toEqual({ code: "AUTH_REQUIRED" });
    expect(mocks.follow).not.toHaveBeenCalled();
  });

  it("returns the authenticated JSON-safe merged collection", async () => {
    mocks.list.mockResolvedValue([{
      kind: "candidate",
      provider: "tse",
      electionYear: 2026,
      externalId: "260001",
      label: "ANA CIDADÃ",
      subtitle: "Deputado federal · ABC · ES",
      href: "/candidatos/2026/260001",
      followedAt: "2026-09-05T12:00:00.000Z",
    }]);

    const response = await GET(new Request("https://app.example/api/follows"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { email: "ana@example.com" },
      items: [expect.objectContaining({ kind: "candidate", provider: "tse" })],
    });
  });
});
