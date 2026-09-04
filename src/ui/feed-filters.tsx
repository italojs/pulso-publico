import type { PublicBillFilters, PublicFilterOptions } from "#/server/public/read-models";
import { ActiveFilterChips } from "#/ui/active-filter-chips";
import { AdvancedFilters } from "#/ui/advanced-filters";
import { SearchIcon } from "#/ui/icons";

interface FeedFiltersProps {
  filters: PublicBillFilters;
  options: PublicFilterOptions;
}

export function FeedFilters({ filters, options }: Readonly<FeedFiltersProps>) {
  const sources = filters.sources ?? (filters.source ? [filters.source] : []);
  const statuses = filters.statuses ?? (filters.status ? [filters.status] : []);
  const topics = filters.topics ?? (filters.topic ? [filters.topic] : []);
  return (
    <form action="/" className="feedFilters" method="get">
      <div className="searchField">
        <SearchIcon />
        <label className="srOnly" htmlFor="feed-search">Buscar projetos</label>
        <input defaultValue={filters.query} id="feed-search" maxLength={200} name="q" placeholder="Busque por tema, código ou palavra" type="search" />
        <button type="submit">Buscar</button>
      </div>
      <fieldset className="quickFilters">
        <legend className="srOnly">Filtros rápidos</legend>
        <label>Casa legislativa<select defaultValue={sources[0] ?? ""} name="fonte"><option value="">Todas</option>{options.sources.map((source) => <option key={source} value={source}>{source === "camara" ? "Câmara" : "Senado"}</option>)}</select></label>
        <label>Situação atual<select defaultValue={statuses[0] ?? ""} name="situacao"><option value="">Todas</option>{options.statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label>Tema<select defaultValue={topics[0] ?? ""} name="tema"><option value="">Todos</option>{options.topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></label>
        <AdvancedFilters filters={filters} options={options} />
        <button className="quickFilters__apply" type="submit">Aplicar</button>
      </fieldset>
      <ActiveFilterChips filters={filters} />
    </form>
  );
}
