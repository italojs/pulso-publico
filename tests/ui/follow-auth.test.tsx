// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LOCAL_FOLLOWS_KEY } from "#/follows/local";
import { FollowButton } from "#/ui/follow-button";
import { FollowingPage } from "#/ui/following-page";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation.js", () => ({ useRouter: () => ({ push: routerPush }) }));

const project = {
  kind: "bill" as const,
  source: "camara" as const,
  externalId: "501",
  label: "PEC 8/2025",
  href: "/projetos/camara/501",
  subtitle: "Em análise",
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  routerPush.mockReset();
  vi.unstubAllGlobals();
});

describe("authenticated following", () => {
  it("redirects a signed-out visitor to login without saving or posting a follow", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: "AUTH_REQUIRED" }),
      { headers: { "content-type": "application/json" }, status: 401 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    render(<FollowButton {...project} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Seguir projeto" }));

    expect(routerPush).toHaveBeenCalledWith("/entrar?next=%2Fprojetos%2Fcamara%2F501");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LOCAL_FOLLOWS_KEY)).toBeNull();
  });

  it("persists a follow in the account only after the authenticated API confirms it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { email: "ana@example.com" }, items: [] }), {
        headers: { "content-type": "application/json" }, status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ followed: true }), {
        headers: { "content-type": "application/json" }, status: 200,
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<FollowButton {...project} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Seguir projeto" }));

    expect(await screen.findByRole("button", { name: "Seguindo" })).toHaveAttribute("aria-pressed", "true");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(LOCAL_FOLLOWS_KEY)).toBeNull();
  });

  it("does not expose locally saved items while the visitor is signed out", async () => {
    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify([project]));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: "AUTH_REQUIRED" }),
      { headers: { "content-type": "application/json" }, status: 401 },
    )));

    render(<FollowingPage />);

    expect(await screen.findByRole("heading", { name: "Entre para acompanhar projetos e parlamentares." })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "PEC 8/2025" })).not.toBeInTheDocument();
    expect(localStorage.getItem(LOCAL_FOLLOWS_KEY)).not.toBeNull();
  });

  it("migrates legacy local follows once after login and clears the browser copy", async () => {
    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify([project]));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { email: "ana@example.com" }, items: [] }), {
        headers: { "content-type": "application/json" }, status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ synced: 1 }), {
        headers: { "content-type": "application/json" }, status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { email: "ana@example.com" },
        items: [{ ...project, alertsEnabled: false }],
      }), { headers: { "content-type": "application/json" }, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<FollowingPage />);

    expect(await screen.findByRole("link", { name: "PEC 8/2025" })).toBeInTheDocument();
    expect(localStorage.getItem(LOCAL_FOLLOWS_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
