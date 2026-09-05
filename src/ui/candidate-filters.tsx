"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation.js";

import type { CandidateOffice } from "#/domain/electoral";
import type { CandidateFilterOptions, CandidateFilters, CandidateRegionOrigin } from "#/server/candidates/read-models";
import { buildCandidateHref } from "#/server/candidates/search-params";
import { CandidateAdvancedFilters } from "#/ui/candidate-advanced-filters";
import { candidateOfficeLabels } from "#/ui/candidate-card";
import { CandidateFilterChips } from "#/ui/candidate-filter-chips";
import { SearchIcon } from "#/ui/icons";

interface CandidateFiltersProps {
  authenticated: boolean;
  filters: CandidateFilters;
  options: CandidateFilterOptions;
  regionOrigin?: CandidateRegionOrigin;
}

const MAX_QUICK_OPTIONS = 20;

function textOptions(catalog: readonly string[], selected: readonly string[]) {
  const available = new Set(catalog);
  return [...new Set([...selected, ...catalog])].slice(0, selected.length + MAX_QUICK_OPTIONS).map((value) => ({
    label: available.has(value) ? value : `${value} — indisponível`,
    value,
  }));
}

function officeOptions(catalog: CandidateFilterOptions["offices"], selected: readonly CandidateOffice[]) {
  const available = new Map(catalog.map((option) => [option.value, option.label]));
  return [...new Set([...selected, ...catalog.map((option) => option.value)])].map((value) => ({
    label: available.get(value) ?? `${candidateOfficeLabels[value]} — indisponível`,
    value,
  }));
}

function safePreservedParams(filters: CandidateFilters) {
  try {
    const params = new URL(buildCandidateHref(filters, 1), "https://local.invalid").searchParams;
    for (const key of ["q", "cargo", "uf", "partido", "pagina"]) params.delete(key);
    return [...params.entries()];
  } catch {
    return [];
  }
}

export function CandidateFilters({ authenticated, filters, options, regionOrigin }: Readonly<CandidateFiltersProps>) {
  const router = useRouter();
  const [query, setQuery] = useState(filters.query ?? "");
  const [offices, setOffices] = useState<CandidateOffice[]>(filters.offices ?? []);
  const [regions, setRegions] = useState<string[]>(filters.regions ?? []);
  const [parties, setParties] = useState<string[]>(filters.parties ?? []);
  const [allBrazil, setAllBrazil] = useState(filters.allBrazil === true);

  useEffect(() => {
    setQuery(filters.query ?? "");
    setOffices(filters.offices ?? []);
    setRegions(filters.regions ?? []);
    setParties(filters.parties ?? []);
    setAllBrazil(filters.allBrazil === true);
  }, [filters]);

  const quickFilters: CandidateFilters = {
    ...filters,
    allBrazil: regions.length ? undefined : allBrazil || undefined,
    query: query.trim() || undefined,
    offices: offices.length ? offices : undefined,
    regions: regions.length ? regions : undefined,
    parties: parties.length ? parties : undefined,
    page: undefined,
  };
  const preserved = useMemo(() => safePreservedParams(quickFilters), [quickFilters]);
  const showBrazilHref = buildCandidateHref({ ...filters, allBrazil: true, regions: undefined, page: undefined }, 1);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(buildCandidateHref(quickFilters, 1));
  };
  const changeRegion = (value: string) => {
    if (value) {
      setRegions([value]);
      setAllBrazil(false);
    } else {
      setRegions([]);
      setAllBrazil(true);
    }
  };

  return (
    <section aria-label="Busca e filtros de candidatos" className="feedFilters candidateFilters">
      <form action="/candidatos" aria-label="Filtros padrão de candidatos" className="feedFilters__quick" method="get" onSubmit={submit}>
        <div className="searchField candidateSearchField">
          <SearchIcon />
          <label className="srOnly" htmlFor="candidate-search">Buscar candidatos</label>
          <input
            id="candidate-search"
            maxLength={200}
            name={query ? "q" : undefined}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Nome civil, nome de urna ou número"
            type="search"
            value={query}
          />
          <button type="submit">Buscar</button>
        </div>
        <fieldset className="quickFilters candidateQuickFilters">
          <legend className="srOnly">Filtros padrão</legend>
          <label>Cargo
            <select name={offices.length ? "cargo" : undefined} onChange={(event) => setOffices(event.currentTarget.value ? [event.currentTarget.value as CandidateOffice] : [])} value={offices[0] ?? ""}>
              <option value="">Todos</option>
              {officeOptions(options.offices, offices).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {offices.slice(1).map((value) => <input key={value} name="cargo" type="hidden" value={value} />)}
          </label>
          <label>UF
            <select name={regions.length ? "uf" : undefined} onChange={(event) => changeRegion(event.currentTarget.value)} value={regions[0] ?? ""}>
              <option value="">Brasil inteiro</option>
              {textOptions(options.regions, regions).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {regions.slice(1).map((value) => <input key={value} name="uf" type="hidden" value={value} />)}
          </label>
          <label>Partido
            <select name={parties.length ? "partido" : undefined} onChange={(event) => setParties(event.currentTarget.value ? [event.currentTarget.value] : [])} value={parties[0] ?? ""}>
              <option value="">Todos</option>
              {textOptions(options.parties, parties).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {parties.slice(1).map((value) => <input key={value} name="partido" type="hidden" value={value} />)}
          </label>
          <button className="quickFilters__apply" type="submit">Aplicar</button>
        </fieldset>
        {preserved.map(([name, value], index) => <input key={`${name}-${value}-${index}`} name={name} type="hidden" value={value} />)}
      </form>
      <div className="candidateFilters__secondary">
        <CandidateAdvancedFilters authenticated={authenticated} filters={filters} options={options} />
        {regionOrigin === "ip" && filters.regions?.length ? (
          <p className="candidateFilters__inferred">
            <span>UF estimada: {filters.regions.join(", ")}</span>
            <a href={showBrazilHref}>Mostrar Brasil inteiro</a>
          </p>
        ) : filters.allBrazil ? <p className="candidateFilters__scope">Brasil inteiro</p> : null}
      </div>
      <CandidateFilterChips filters={filters} />
    </section>
  );
}
