"use client";

import { useEffect, useMemo, useState } from "react";

import { LOCAL_FOLLOWS_CHANGED_EVENT, LOCAL_FOLLOWS_KEY, parseLocalBillReferences } from "#/follows/local";
import type { PublicBillFilters, PublicBillPage } from "#/server/public/read-models";
import { publicFilterRequestFilters } from "#/ui/advanced-filters";
import { ProjectResults } from "#/ui/project-results";

type AnonymousBillKey = { source: "camara" | "senado"; externalId: string };
type LoadState = "loading" | "ready" | "error";

function emptyPage(filters: PublicBillFilters): PublicBillPage {
  return {
    items: [],
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 20,
    total: 0,
    totalPages: 1,
  };
}

function AnonymousFollowedResultsSession({ filters, requestIdentity }: Readonly<{
  filters: PublicBillFilters;
  requestIdentity: string;
}>) {
  const baseRequestFilters = useMemo(() => JSON.parse(requestIdentity) as PublicBillFilters, [requestIdentity]);
  const [billKeys, setBillKeys] = useState<AnonymousBillKey[] | null>(null);
  const [page, setPage] = useState(baseRequestFilters.page ?? 1);
  const [projects, setProjects] = useState<PublicBillPage>();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const requestFilters = useMemo(() => ({
    ...baseRequestFilters,
    page,
  }), [baseRequestFilters, page]);

  useEffect(() => {
    const readKeys = () => setBillKeys(parseLocalBillReferences(localStorage.getItem(LOCAL_FOLLOWS_KEY)));
    const refreshKeys = () => {
      setPage(1);
      readKeys();
    };
    readKeys();
    window.addEventListener(LOCAL_FOLLOWS_CHANGED_EVENT, refreshKeys);
    return () => window.removeEventListener(LOCAL_FOLLOWS_CHANGED_EVENT, refreshKeys);
  }, []);

  useEffect(() => {
    if (billKeys === null) return;
    if (billKeys.length === 0) {
      setProjects(emptyPage(requestFilters));
      setLoadState("ready");
      return;
    }

    const controller = new AbortController();
    setLoadState("loading");
    void fetch("/api/projects/search", {
      body: JSON.stringify({ filters: requestFilters, anonymousBillKeys: billKeys }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Anonymous followed search failed");
      const result = await response.json() as PublicBillPage;
      if (!controller.signal.aborted) {
        setProjects(result);
        setLoadState("ready");
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && (!(error instanceof Error) || error.name !== "AbortError")) {
        setLoadState("error");
      }
    });
    return () => controller.abort();
  }, [billKeys, requestFilters]);

  if (loadState === "error") {
    return <section aria-labelledby="results-title" className="feedResults"><h2 id="results-title" className="srOnly">Projetos encontrados</h2><p className="sectionEmpty" role="alert">Não foi possível carregar os projetos acompanhados.</p></section>;
  }
  if (!projects || loadState === "loading") {
    return <section aria-labelledby="results-title" aria-busy="true" className="feedResults"><h2 id="results-title" className="srOnly">Projetos encontrados</h2><p className="sectionEmpty">Carregando projetos acompanhados…</p></section>;
  }
  return <ProjectResults emptyFollowed={billKeys?.length === 0} filters={filters} onPageChange={setPage} projects={projects} />;
}

export function AnonymousFollowedResults({ filters }: Readonly<{ filters: PublicBillFilters }>) {
  const requestIdentity = JSON.stringify({
    ...publicFilterRequestFilters(filters),
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 20,
  });
  return <AnonymousFollowedResultsSession filters={filters} key={requestIdentity} requestIdentity={requestIdentity} />;
}
