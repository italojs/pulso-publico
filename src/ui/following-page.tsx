"use client";

import { useCallback, useEffect, useState } from "react";

import type { LocalFollow } from "#/follows/local";
import { LOCAL_FOLLOWS_KEY, localFollowKey, parseLocalFollows } from "#/follows/local";
import { SourceBadge } from "#/ui/source-badge";

type FollowedView = LocalFollow & { alertsEnabled?: boolean };

export function FollowingPage() {
  const [items, setItems] = useState<FollowedView[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const local = parseLocalFollows(localStorage.getItem(LOCAL_FOLLOWS_KEY));
    const first = await fetch("/api/follows").catch(() => null);
    if (first?.status === 401) {
      setAnonymous(true);
      setReady(true);
      return;
    }
    if (!first?.ok) {
      setError(true);
      setReady(true);
      return;
    }
    if (local.length > 0) {
      const sync = await fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync", items: local.map(({ kind, source, externalId }) => ({ kind, source, externalId })) }) }).catch(() => null);
      if (sync?.ok) localStorage.removeItem(LOCAL_FOLLOWS_KEY);
    }
    const response = await fetch("/api/follows").catch(() => null);
    if (!response?.ok) {
      setError(true);
      setReady(true);
      return;
    }
    const data = await response.json() as { user: { email: string }; items: FollowedView[] };
    setItems(data.items);
    setAccount(data.user.email);
    setReady(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(item: FollowedView) {
    const response = await fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unfollow", kind: item.kind, source: item.source, externalId: item.externalId }) }).catch(() => null);
    if (response?.ok) setItems((current) => current.filter((candidate) => localFollowKey(candidate) !== localFollowKey(item)));
    else setError(true);
  }

  if (!ready) return <p className="sectionEmpty" aria-busy="true">Organizando seus itens seguidos…</p>;
  if (anonymous) return <div className="emptyState"><span aria-hidden="true">○</span><h2>Entre para acompanhar projetos e parlamentares.</h2><p>Consultar informações continua livre. Uma conta é necessária para salvar acompanhamentos e receber alertas.</p><a href="/entrar?next=%2Fseguindo">Entrar ou criar conta</a></div>;
  if (!account) return <p className="sectionEmpty" role="alert">Não foi possível abrir seus acompanhamentos agora. Tente recarregar a página.</p>;
  return (
    <>
      <div className="followingAccount"><span>Sincronizado com</span><strong>{account}</strong><form action="/api/auth/logout" method="post"><button type="submit">Sair da conta</button></form></div>
      {error ? <p className="sectionEmpty" role="alert">Não foi possível concluir a última alteração. Tente novamente.</p> : null}
      {items.length ? <div className="followingList">{items.map((item) => <article key={localFollowKey(item)}><div><SourceBadge source={item.source} /><span className="eyebrow">{item.kind === "bill" ? "Projeto" : "Parlamentar"}</span><h2><a href={item.href}>{item.label}</a></h2>{item.subtitle ? <p>{item.subtitle}</p> : null}{item.alertsEnabled ? <span className="alertOn">Alertas ativos</span> : null}</div><button type="button" onClick={() => remove(item)}>Deixar de seguir</button></article>)}</div> : <div className="emptyState"><span aria-hidden="true">○</span><h2>Você ainda não segue nenhum item.</h2><p>Abra um projeto ou parlamentar e use o botão “Seguir”.</p><a href="/">Descobrir projetos</a></div>}
    </>
  );
}
