"use client";

import { useEffect, useState } from "react";

import { BellIcon } from "#/ui/icons";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const decoded = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function PushOptIn() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [state, setState] = useState<"hidden" | "available" | "active" | "error">("hidden");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    fetch("/api/push/subscriptions").then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { available: boolean; publicKey: string | null };
      if (data.available && data.publicKey) {
        setPublicKey(data.publicKey);
        const registration = await navigator.serviceWorker.register("/sw.js");
        setState((await registration.pushManager.getSubscription()) ? "active" : "available");
      }
    }).catch(() => undefined);
  }, []);

  async function activate() {
    if (!publicKey) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState("error");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      const json = subscription.toJSON();
      const response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscribe", subscription: json }) });
      setState(response.ok ? "active" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "hidden") return null;
  return <aside className={`pushOptIn pushOptIn--${state}`}><BellIcon /><div><strong>{state === "active" ? "Notificações deste navegador estão ativas" : "Receba também no navegador"}</strong><p>{state === "error" ? "A permissão não foi concedida ou o navegador não conseguiu concluir a inscrição." : "A caixa de alertas continuará sendo o registro completo."}</p></div>{state === "available" ? <button type="button" onClick={activate}>Ativar notificações</button> : null}</aside>;
}
