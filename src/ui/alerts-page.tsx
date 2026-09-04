"use client";

import { useEffect, useState } from "react";

import { formatDateTime } from "#/ui/format";
import { ExternalIcon } from "#/ui/icons";
import { SourceBadge } from "#/ui/source-badge";
import { PushOptIn } from "#/ui/push-opt-in";

type AlertView = {
  id: string;
  type: "status_change" | "vote_scheduled" | "vote_result" | "sanction_or_veto" | "archived" | "in_force";
  title: string;
  officialDescription: string;
  officialUrl: string;
  occurredAt: string;
  readAt: string | null;
  source: "camara" | "senado";
  officialCode: string;
  projectHref: string;
};

const labels: Record<AlertView["type"], string> = {
  status_change: "Mudança de situação",
  vote_scheduled: "Votação agendada",
  vote_result: "Resultado de votação",
  sanction_or_veto: "Sanção ou veto",
  archived: "Arquivamento",
  in_force: "Norma publicada",
};

export function AlertsPage() {
  const [items, setItems] = useState<AlertView[]>([]);
  const [state, setState] = useState<"loading" | "anonymous" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("/api/alerts")
      .then(async (response) => {
        if (response.status === 401) return setState("anonymous");
        if (!response.ok) return setState("error");
        const data = await response.json() as { items: AlertView[] };
        setItems(data.items);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  async function markRead(id: string | "all") {
    const response = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", id }) });
    if (!response.ok) return;
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => id === "all" || item.id === id ? { ...item, readAt: now } : item));
  }

  if (state === "loading") return <p className="sectionEmpty" aria-busy="true">Carregando seus alertas…</p>;
  if (state === "anonymous") return <div className="emptyState"><span aria-hidden="true">○</span><h2>Entre para receber alertas.</h2><p>Você pode continuar seguindo itens sem conta. O cadastro é necessário apenas para sincronizar e avisar sobre mudanças importantes.</p><a href="/entrar?next=%2Falertas">Entrar ou criar conta</a></div>;
  if (state === "error") return <p className="sectionEmpty" role="alert">Não foi possível abrir os alertas agora. Tente recarregar a página.</p>;
  if (!items.length) return <div className="emptyState"><span aria-hidden="true">○</span><h2>Nenhuma mudança importante por enquanto.</h2><p>Quando um projeto com alertas ativos avançar, o aviso aparecerá aqui.</p><a href="/seguindo">Ver itens seguidos</a></div>;
  const unread = items.filter((item) => !item.readAt).length;
  return (
    <>
      <PushOptIn />
      <div className="alertsToolbar"><p><strong>{unread}</strong> {unread === 1 ? "alerta não lido" : "alertas não lidos"}</p>{unread ? <button onClick={() => markRead("all")} type="button">Marcar todos como lidos</button> : null}</div>
      <div className="alertsList">{items.map((item) => <article className={item.readAt ? "alertCard alertCard--read" : "alertCard"} key={item.id}><span className="alertCard__marker" aria-label={item.readAt ? "Lido" : "Não lido"} /><div><div className="alertCard__meta"><SourceBadge source={item.source} /><span>{labels[item.type]}</span><time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time></div><h2><a href={item.projectHref}>{item.title}</a></h2><p>{item.officialDescription}</p><div className="alertCard__actions"><a href={item.officialUrl} rel="noreferrer" target="_blank">Conferir registro oficial <ExternalIcon /></a>{!item.readAt ? <button onClick={() => markRead(item.id)} type="button">Marcar como lido</button> : null}</div></div></article>)}</div>
    </>
  );
}
