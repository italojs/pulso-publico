"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation.js";

import type { LocalFollow } from "#/follows/local";
import { localFollowKey } from "#/follows/local";
import { BellIcon, BookmarkIcon } from "#/ui/icons";

type FollowButtonProps = LocalFollow & { compact?: boolean };

export function FollowButton(props: Readonly<FollowButtonProps>) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [followed, setFollowed] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/follows", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (response.status === 401) {
          setAuthenticated(false);
          return null;
        }
        if (!response.ok) return null;
        setAuthenticated(true);
        return response.json() as Promise<{ items: Array<LocalFollow & { alertsEnabled?: boolean }> }>;
      })
      .then((data) => {
        const stored = data?.items.find((item) => localFollowKey(item) === localFollowKey(props));
        if (stored) {
          setFollowed(true);
          setAlertsEnabled(Boolean(stored.alertsEnabled));
        }
      })
      .catch(() => undefined);
  }, [props.kind, props.source, props.externalId, props.label, props.href, props.subtitle]);

  function goToLogin() {
    router.push(`/entrar?next=${encodeURIComponent(props.href)}`);
  }

  async function toggle() {
    if (authenticated === false) {
      goToLogin();
      return;
    }
    const next = !followed;
    const response = await fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: next ? "follow" : "unfollow", kind: props.kind, source: props.source, externalId: props.externalId }),
    }).catch(() => null);
    if (response?.status === 401) {
      setAuthenticated(false);
      goToLogin();
      return;
    }
    if (!response?.ok) {
      setMessage("Não foi possível atualizar seu acompanhamento agora.");
      return;
    }
    setAuthenticated(true);
    setFollowed(next);
    if (!next) setAlertsEnabled(false);
    setMessage(next ? "Projeto salvo na sua conta." : "Removido dos itens seguidos.");
  }

  async function enableAlerts() {
    if (authenticated === false) {
      goToLogin();
      return;
    }
    const response = await fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "follow", kind: "bill", source: props.source, externalId: props.externalId, alertsEnabled: true }),
    }).catch(() => null);
    if (response?.status === 401) {
      setAuthenticated(false);
      goToLogin();
      return;
    }
    if (response?.ok) {
      setAuthenticated(true);
      setFollowed(true);
      setAlertsEnabled(true);
      setMessage("Alertas ativados para este projeto.");
    } else {
      setMessage("Não foi possível ativar os alertas agora.");
    }
  }

  return (
    <div className={`followActions${props.compact ? " followActions--compact" : ""}`}>
      <button aria-pressed={followed} className="followButton" onClick={toggle} type="button"><BookmarkIcon />{followed ? "Seguindo" : props.kind === "bill" ? "Seguir projeto" : "Seguir parlamentar"}</button>
      {props.kind === "bill" && !props.compact ? <button aria-pressed={alertsEnabled} className="alertButton" disabled={alertsEnabled} onClick={enableAlerts} type="button"><BellIcon />{alertsEnabled ? "Alertas ativos" : "Ativar alertas"}</button> : null}
      <span className="srOnly" aria-live="polite">{message}</span>
    </div>
  );
}
