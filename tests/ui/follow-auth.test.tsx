// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LOCAL_FOLLOWS_KEY } from "#/follows/local";
import { CandidateFollowButton } from "#/ui/candidate-follow-button";
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

const candidate = {
  kind: "candidate" as const,
  provider: "tse" as const,
  electionYear: 2026,
  externalId: "260001234567",
  label: "ANA CIDADÃ",
  href: "/candidatos/2026/260001234567",
  subtitle: "Deputado federal · ABC · ES",
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  routerPush.mockReset();
  vi.unstubAllGlobals();
});

describe("authenticated following", () => {
  it("redirects a signed-out candidate visitor without posting, writing local state or pressing optimistically", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: "AUTH_REQUIRED" }),
      { headers: { "content-type": "application/json" }, status: 401 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    render(<CandidateFollowButton
      electionYear={candidate.electionYear}
      externalId={candidate.externalId}
      href={candidate.href}
    />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const button = screen.getByRole("button", { name: "Seguir candidato" });
    fireEvent.click(button);

    expect(routerPush).toHaveBeenCalledWith("/entrar?next=%2Fcandidatos%2F2026%2F260001234567");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem(LOCAL_FOLLOWS_KEY)).toBeNull();
  });

  it("presses a candidate follow only after server confirmation and blocks duplicate in-flight writes", async () => {
    let resolvePost: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { email: "ana@example.com" }, items: [] }), {
        headers: { "content-type": "application/json" }, status: 200,
      }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolvePost = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CandidateFollowButton
      electionYear={candidate.electionYear}
      externalId={candidate.externalId}
      href={candidate.href}
    />);
    const button = await screen.findByRole("button", { name: "Seguir candidato" });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      action: "follow",
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001234567",
    });

    await act(async () => {
      resolvePost?.(new Response(JSON.stringify({ followed: true }), {
        headers: { "content-type": "application/json" }, status: 200,
      }));
    });
    expect(await screen.findByRole("button", { name: "Seguindo" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Candidatura salva na sua conta.");
  });

  it("keeps candidate state server-confirmed across unfollow errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { email: "ana@example.com" },
        items: [candidate],
      }), { headers: { "content-type": "application/json" }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "UNAVAILABLE" }), {
        headers: { "content-type": "application/json" }, status: 503,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ followed: false }), {
        headers: { "content-type": "application/json" }, status: 200,
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CandidateFollowButton
      electionYear={candidate.electionYear}
      externalId={candidate.externalId}
      href={candidate.href}
    />);

    const button = await screen.findByRole("button", { name: "Seguindo" });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Não foi possível atualizar seu acompanhamento agora."));
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(button);
    expect(await screen.findByRole("button", { name: "Seguir candidato" })).toHaveAttribute("aria-pressed", "false");
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      action: "unfollow",
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001234567",
    });
  });

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

    expect(await screen.findByRole("heading", { name: "Entre para acompanhar projetos, parlamentares e candidatos." })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "PEC 8/2025" })).not.toBeInTheDocument();
    expect(localStorage.getItem(LOCAL_FOLLOWS_KEY)).not.toBeNull();
  });

  it("migrates legacy local follows once after login and clears the browser copy", async () => {
    const lawmaker = {
      kind: "lawmaker" as const,
      source: "senado" as const,
      externalId: "8101",
      label: "Pessoa Política",
      href: "/parlamentares/senado/8101",
      subtitle: "ABC · PE",
    };
    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify([project, lawmaker, candidate]));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { email: "ana@example.com" }, items: [] }), {
        headers: { "content-type": "application/json" }, status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ synced: 2 }), {
        headers: { "content-type": "application/json" }, status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { email: "ana@example.com" },
        items: [{ ...project, alertsEnabled: false }, lawmaker],
      }), { headers: { "content-type": "application/json" }, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<FollowingPage />);

    expect(await screen.findByRole("link", { name: "PEC 8/2025" })).toBeInTheDocument();
    expect(localStorage.getItem(LOCAL_FOLLOWS_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      action: "sync",
      items: [
        { kind: "bill", source: "camara", externalId: "501" },
        { kind: "lawmaker", source: "senado", externalId: "8101" },
      ],
    });
  });

  it("renders and removes a TSE candidacy without colliding with a legislative follow", async () => {
    const lawmaker = {
      kind: "lawmaker" as const,
      source: "camara" as const,
      externalId: candidate.externalId,
      label: "ANA PARLAMENTAR",
      href: `/parlamentares/camara/${candidate.externalId}`,
      subtitle: "ABC · ES",
      alertsEnabled: false,
    };
    const accountResponse = new Response(JSON.stringify({ user: { email: "ana@example.com" }, items: [] }), {
      headers: { "content-type": "application/json" }, status: 200,
    });
    const listResponse = new Response(JSON.stringify({
      user: { email: "ana@example.com" },
      items: [candidate, lawmaker],
    }), { headers: { "content-type": "application/json" }, status: 200 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(accountResponse)
      .mockResolvedValueOnce(listResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify({ followed: false }), {
        headers: { "content-type": "application/json" }, status: 200,
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<FollowingPage />);

    const candidateLink = await screen.findByRole("link", { name: "ANA CIDADÃ" });
    const candidateArticle = candidateLink.closest("article");
    if (!candidateArticle) throw new Error("candidate article missing");
    expect(within(candidateArticle).getByText("TSE")).toBeVisible();
    expect(within(candidateArticle).getByText("Candidatura")).toBeVisible();
    expect(within(candidateArticle).getByText("Deputado federal · ABC · ES")).toBeVisible();
    expect(screen.getByRole("link", { name: "ANA PARLAMENTAR" })).toBeVisible();

    fireEvent.click(within(candidateArticle).getByRole("button", { name: "Deixar de seguir" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "ANA CIDADÃ" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "ANA PARLAMENTAR" })).toBeVisible();
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      action: "unfollow",
      kind: "candidate",
      electionYear: 2026,
      externalId: "260001234567",
    });
  });

  it("invites an empty authenticated account to discover candidates", async () => {
    const response = () => new Response(JSON.stringify({
      user: { email: "ana@example.com" },
      items: [],
    }), { headers: { "content-type": "application/json" }, status: 200 });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response()));

    render(<FollowingPage />);

    expect(await screen.findByText("Abra um projeto, parlamentar ou candidato e use o botão “Seguir”.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Conhecer candidatos" })).toHaveAttribute("href", "/candidatos");
  });
});
