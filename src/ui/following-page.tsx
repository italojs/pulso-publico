"use client";

import { useCallback, useEffect, useState } from "react";

import type { LocalFollow } from "#/follows/local";
import { LOCAL_FOLLOWS_KEY, localFollowKey, parseLocalFollows, toggleLocalFollow } from "#/follows/local";
import { SourceBadge } from "#/ui/source-badge";

type FollowedView = LocalFollow & { alertsEnabled?: boolean };

export function FollowingPage() {
  const [items, setItems] = useState<FollowedView[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const local = parseLocalFollows(localStorage.getItem(LOCAL_FOLLOWS_KEY));
    const first = await fetch("/api/follows").catch(() => null);
    if (!first?.ok) {
      setItems(local);
      setReady(true);
      return;
    }
    if (local.length > 0) {
      await fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync", items: local.map(({ kind, source, externalId }) => ({ kind, source, externalId })) }) });
    }
    const response = await fetch("/api/follows");
    const data = await response.json() as { user: { email: string }; items: FollowedView[] };
    const merged = [...new Map([...local, ...data.items].map((item) => [localFollowKey(item), item])).values()];
    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify(merged));
    setItems(merged);
    setAccount(data.user.email);
    setReady(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(item: FollowedView) {
    const next = toggleLocalFollow(parseLocalFollows(localStorage.getItem(LOCAL_FOLLOWS_KEY)), item, false);
    localStorage.setItem(LOCAL_FOLLOWS_KEY, JSON.stringify(next));
    setItems((current) => current.filter((candidate) => localFollowKey(candidate) !== localFollowKey(item)));
    if (account) await fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unfollow", kind: item.kind, source: item.source, externalId: item.externalId }) });
  }

  if (!ready) return <p className="sectionEmpty" aria-busy="true">Organizando seus itens seguidos…</p>;
  return (
    <>
      <div className="followingAccount">{account ? <><span>Sincronizado com</span><strong>{account}</strong><form action="/api/auth/logout" method="post"><button type="submit">Sair da conta</button></form></> : <><span>Salvo somente neste dispositivo</span><a href="/entrar?next=%2Fseguindo">Entrar para sincronizar e ativar alertas</a></>}</div>
      {items.length ? <div className="followingList">{items.map((item) => <article key={localFollowKey(item)}><div><SourceBadge source={item.source} /><span className="eyebrow">{item.kind === "bill" ? "Projeto" : "Parlamentar"}</span><h2><a href={item.href}>{item.label}</a></h2>{item.subtitle ? <p>{item.subtitle}</p> : null}{item.alertsEnabled ? <span className="alertOn">Alertas ativos</span> : null}</div><button type="button" onClick={() => remove(item)}>Deixar de seguir</button></article>)}</div> : <div className="emptyState"><span aria-hidden="true">○</span><h2>Você ainda não segue nenhum item.</h2><p>Abra um projeto ou parlamentar e use o botão “Seguir”.</p><a href="/">Descobrir projetos</a></div>}
    </>
  );
}
