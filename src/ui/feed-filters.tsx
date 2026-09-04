"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation.js";

import { LOCAL_FOLLOWS_CHANGED_EVENT, LOCAL_FOLLOWS_KEY, parseLocalBillReferences } from "#/follows/local";
import type { PublicBillFilters, PublicFilterOptions } from "#/server/public/read-models";
import { buildFeedHref } from "#/server/public/search-params";
import { ActiveFilterChips } from "#/ui/active-filter-chips";
import { AdvancedFilters } from "#/ui/advanced-filters";
import { SearchIcon } from "#/ui/icons";

interface FeedFiltersProps {
  filters: PublicBillFilters;
  options: PublicFilterOptions;
}

const MAX_QUICK_OPTIONS = 12;

function quickTextOptions(catalog: readonly string[], selected: readonly string[]) {
  const available = new Set(catalog);
  return [...new Set([...selected, ...catalog])].slice(0, selected.length + MAX_QUICK_OPTIONS).map((value) => ({
    label: available.has(value) ? value : `${value} — indisponível`,
    value,
  }));
}

export function FeedFilters({ filters, options }: Readonly<FeedFiltersProps>) {
  const router = useRouter();
  const [anonymousBillKeys, setAnonymousBillKeys] = useState<Array<{ source: "camara" | "senado"; externalId: string }>>([]);
  const initialSources = filters.sources ?? (filters.source ? [filters.source] : []);
  const initialStatuses = filters.statuses ?? (filters.status ? [filters.status] : []);
  const initialTopics = filters.topics ?? (filters.topic ? [filters.topic] : []);
  const [query, setQuery] = useState(filters.query ?? "");
  const [sources, setSources] = useState(initialSources);
  const [statuses, setStatuses] = useState(initialStatuses);
  const [topics, setTopics] = useState(initialTopics);
  useEffect(() => {
    setQuery(filters.query ?? "");
    setSources(filters.sources ?? (filters.source ? [filters.source] : []));
    setStatuses(filters.statuses ?? (filters.status ? [filters.status] : []));
    setTopics(filters.topics ?? (filters.topic ? [filters.topic] : []));
  }, [filters]);
  useEffect(() => {
    const refresh = () => setAnonymousBillKeys(parseLocalBillReferences(localStorage.getItem(LOCAL_FOLLOWS_KEY)));
    refresh();
    window.addEventListener(LOCAL_FOLLOWS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_FOLLOWS_CHANGED_EVENT, refresh);
  }, []);
  const preserved = new URL(buildFeedHref(filters, 1), "https://local.invalid").searchParams;
  for (const quickDimension of ["q", "fonte", "situacao", "tema", "pagina"]) preserved.delete(quickDimension);
  const sourceCatalog = [
    { value: "camara", label: "Câmara" },
    { value: "senado", label: "Senado" },
  ].filter((option) => options.sources.includes(option.value as "camara" | "senado"));
  const sourceOptions = [...new Set([...sources, ...sourceCatalog.map((option) => option.value)])]
    .map((value) => sourceCatalog.find((option) => option.value === value) ?? { value, label: `${value} — indisponível` });
  const submitQuickFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(buildFeedHref({
      ...filters,
      page: undefined,
      query: query.trim() || undefined,
      source: undefined,
      sources,
      status: undefined,
      statuses,
      topic: undefined,
      topics,
    }, 1));
  };
  return (
    <div className="feedFilters">
      <form action="/" aria-label="Filtros rápidos" className="feedFilters__quick" method="get" onSubmit={submitQuickFilters}>
      <div className="searchField">
        <SearchIcon />
        <label className="srOnly" htmlFor="feed-search">Buscar projetos</label>
        <input id="feed-search" maxLength={200} name={query ? "q" : undefined} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Busque por tema, código ou palavra" type="search" value={query} />
        <button type="submit">Buscar</button>
      </div>
      <fieldset className="quickFilters">
        <legend className="srOnly">Filtros rápidos</legend>
        <label>Casa legislativa<select name={sources.length ? "fonte" : undefined} onChange={(event) => setSources(event.currentTarget.value ? [event.currentTarget.value as "camara" | "senado"] : [])} value={sources[0] ?? ""}><option value="">Todas</option>{sourceOptions.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select>{sources.slice(1).map((value) => <input key={value} name="fonte" type="hidden" value={value} />)}</label>
        <label>Situação atual<select name={statuses.length ? "situacao" : undefined} onChange={(event) => setStatuses(event.currentTarget.value ? [event.currentTarget.value] : [])} value={statuses[0] ?? ""}><option value="">Todas</option>{quickTextOptions(options.statuses, statuses).map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>{statuses.slice(1).map((value) => <input key={value} name="situacao" type="hidden" value={value} />)}</label>
        <label>Tema<select name={topics.length ? "tema" : undefined} onChange={(event) => setTopics(event.currentTarget.value ? [event.currentTarget.value] : [])} value={topics[0] ?? ""}><option value="">Todos</option>{quickTextOptions(options.topics, topics).map((topic) => <option key={topic.value} value={topic.value}>{topic.label}</option>)}</select>{topics.slice(1).map((value) => <input key={value} name="tema" type="hidden" value={value} />)}</label>
        <button className="quickFilters__apply" type="submit">Aplicar</button>
      </fieldset>
      {[...preserved.entries()].map(([name, value], index) => <input key={`${name}-${value}-${index}`} name={name} type="hidden" value={value} />)}
      </form>
      <AdvancedFilters anonymousBillKeys={anonymousBillKeys} filters={filters} options={options} />
      <ActiveFilterChips filters={filters} />
    </div>
  );
}
