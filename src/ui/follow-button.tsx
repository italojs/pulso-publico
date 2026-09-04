"use client";

import { useEffect, useState } from "react";

import type { LocalFollow } from "#/follows/local";
import { LOCAL_FOLLOWS_KEY, localFollowKey, parseLocalFollows, toggleLocalFollow } from "#/follows/local";
import { BellIcon, BookmarkIcon } from "#/ui/icons";

type FollowButtonProps = LocalFollow & { compact?: boolean };

export function FollowButton(props: Readonly<FollowButtonProps>) {
  const [followed, setFollowed] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const local = parseLocalFollows(localStorage.getItem(LOCAL_FOLLOWS_KEY));
    setFollowed(local.some((item) => localFollowKey(item) === localFollowKey(props)));
    fetch("/api/follows", { headers: { Accept: "application/json" } })
      .then(async (response) => response.ok ? response.json() as Promise<{ items: Array<LocalFollow & { alertsEnabled?: boolean }> }> : null)
      .then((data) => {
        const stored = data?.items.find((item) => localFollowKey(item) === localFollowKey(props));
        if (stored) {
          setFollowed(true);
          setAlertsEnabled(Boolean(stored.alertsEnabled));
          const merged = toggleLocalFollow(parseLocalFollows(localStorage.getItem(LOCAL_FOLLOWS_KEY)), props, true);
          localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify(merged));
        }
      })
      .catch(() => undefined);
  }, [props.kind, props.source, props.externalId, props.label, props.href, props.subtitle]);

  function persistLocal(value: boolean) {
    const next = toggleLocalFollow(parseLocalFollows(localStorage.getItem(LOCAL_FOLLOWS_KEY)), props, value);
    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("pulso:follows-changed"));
  }

  async function toggle() {
    const next = !followed;
    setFollowed(next);
    if (!next) setAlertsEnabled(false);
    persistLocal(next);
    setMessage(next ? "Salvo neste dispositivo." : "Removido dos itens seguidos.");
    await fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: next ? "follow" : "unfollow", kind: props.kind, source: props.source, externalId: props.externalId }),
    }).catch(() => undefined);
  }

  async function enableAlerts() {
    if (!followed) {
      setFollowed(true);
      persistLocal(true);
    }
    const response = await fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "follow", kind: "bill", source: props.source, externalId: props.externalId, alertsEnabled: true }),
    }).catch(() => null);
    if (response?.status === 401) {
      window.location.assign(`/entrar?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (response?.ok) {
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
