"use client";

import { useCallback, useEffect, useState } from "react";

import type { LocalFollow } from "#/follows/local";
import { LOCAL_FOLLOWS_KEY, localFollowKey, parseLocalFollows } from "#/follows/local";
import { SourceBadge } from "#/ui/source-badge";

type LegislativeFollowedView = LocalFollow & { alertsEnabled?: boolean; followedAt?: string };
type CandidateFollowedView = {
  kind: "candidate";
  provider: "tse";
  electionYear: number;
  externalId: string;
  label: string;
  subtitle: string;
  href: string;
  followedAt?: string;
};
type FollowedView = LegislativeFollowedView | CandidateFollowedView;

function followedViewKey(item: FollowedView) {
  return item.kind === "candidate"
    ? `candidate:${item.electionYear}:${item.externalId}`
    : localFollowKey(item);
}

export function FollowingPage() {
  const [items, setItems] = useState<FollowedView[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

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
    const key = followedViewKey(item);
    if (removing) return;
    setRemoving(key);
    const reference = item.kind === "candidate"
      ? { action: "unfollow" as const, kind: item.kind, electionYear: item.electionYear, externalId: item.externalId }
      : { action: "unfollow" as const, kind: item.kind, source: item.source, externalId: item.externalId };
    const response = await fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reference),
    }).catch(() => null);
    if (response?.ok) setItems((current) => current.filter((candidate) => followedViewKey(candidate) !== key));
    else setError(true);
    setRemoving(null);
  }

  if (!ready) return <p className="sectionEmpty" aria-busy="true">Organizando seus itens seguidos…</p>;
  if (anonymous) return <div className="emptyState"><span aria-hidden="true">○</span><h2>Entre para acompanhar projetos, parlamentares e candidatos.</h2><p>Consultar informações continua livre. Uma conta é necessária para salvar acompanhamentos; alertas estão disponíveis para projetos.</p><a href="/entrar?next=%2Fseguindo">Entrar ou criar conta</a></div>;
  if (!account) return <p className="sectionEmpty" role="alert">Não foi possível abrir seus acompanhamentos agora. Tente recarregar a página.</p>;
  return (
    <>
      <div className="followingAccount"><span>Sincronizado com</span><strong>{account}</strong><form action="/api/auth/logout" method="post"><button type="submit">Sair da conta</button></form></div>
      {error ? <p className="sectionEmpty" role="alert">Não foi possível concluir a última alteração. Tente novamente.</p> : null}
      {items.length ? <div className="followingList">{items.map((item) => <article key={followedViewKey(item)}><div>{item.kind === "candidate" ? <span className="sourceBadge sourceBadge--tse"><span aria-hidden="true" className="sourceBadge__dot" />TSE</span> : <SourceBadge source={item.source} />}<span className="eyebrow">{item.kind === "bill" ? "Projeto" : item.kind === "lawmaker" ? "Parlamentar" : "Candidatura"}</span><h2><a href={item.href}>{item.label}</a></h2>{item.subtitle ? <p>{item.subtitle}</p> : null}{item.kind !== "candidate" && item.alertsEnabled ? <span className="alertOn">Alertas ativos</span> : null}</div><button disabled={removing === followedViewKey(item)} type="button" onClick={() => remove(item)}>Deixar de seguir</button></article>)}</div> : <div className="emptyState"><span aria-hidden="true">○</span><h2>Você ainda não segue nenhum item.</h2><p>Abra um projeto, parlamentar ou candidato e use o botão “Seguir”.</p><div><a href="/">Descobrir projetos</a> · <a href="/candidatos">Conhecer candidatos</a></div></div>}
    </>
  );
}
