"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation.js";

import { BookmarkIcon } from "#/ui/icons";

interface CandidateFollowButtonProps {
  electionYear: number;
  externalId: string;
  href: string;
}

interface CandidateFollowItem {
  kind: "candidate";
  electionYear: number;
  externalId: string;
}

export function CandidateFollowButton({
  electionYear,
  externalId,
  href,
}: Readonly<CandidateFollowButtonProps>) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/follows", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!active) return null;
        if (response.status === 401) {
          setAuthenticated(false);
          return null;
        }
        if (!response.ok) {
          setMessage("Não foi possível verificar seu acompanhamento agora.");
          return null;
        }
        setAuthenticated(true);
        return response.json() as Promise<{ items: CandidateFollowItem[] }>;
      })
      .then((data) => {
        if (!active || !data) return;
        setFollowed(data.items.some((item) =>
          item.kind === "candidate"
          && item.electionYear === electionYear
          && item.externalId === externalId));
      })
      .catch(() => {
        if (active) setMessage("Não foi possível verificar seu acompanhamento agora.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [electionYear, externalId]);

  function goToLogin() {
    router.push(`/entrar?next=${encodeURIComponent(href)}`);
  }

  async function toggle() {
    if (loading || pending) return;
    if (authenticated === false) {
      goToLogin();
      return;
    }
    const next = !followed;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: next ? "follow" : "unfollow",
          kind: "candidate",
          electionYear,
          externalId,
        }),
      });
      if (response.status === 401) {
        setAuthenticated(false);
        goToLogin();
        return;
      }
      if (!response.ok) {
        setMessage("Não foi possível atualizar seu acompanhamento agora.");
        return;
      }
      const confirmation = await response.json().catch(() => null) as { followed?: unknown } | null;
      if (confirmation?.followed !== next) {
        setMessage("Não foi possível confirmar a alteração no servidor.");
        return;
      }
      setAuthenticated(true);
      setFollowed(next);
      setMessage(next ? "Candidatura salva na sua conta." : "Candidatura removida dos itens seguidos.");
    } catch {
      setMessage("Não foi possível atualizar seu acompanhamento agora.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="followActions">
      <button
        aria-pressed={followed}
        className="followButton"
        disabled={loading || pending}
        onClick={toggle}
        type="button"
      >
        <BookmarkIcon />
        {followed ? "Seguindo" : "Seguir candidato"}
      </button>
      <span className="srOnly" aria-live="polite" role="status">{message}</span>
    </div>
  );
}
