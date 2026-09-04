import type { PublicBillFilters, PublicFilterOptions } from "#/server/public/read-models";
import { SearchIcon } from "#/ui/icons";

interface FeedFiltersProps {
  filters: PublicBillFilters;
  options: PublicFilterOptions;
}

export function FeedFilters({ filters, options }: Readonly<FeedFiltersProps>) {
  return (
    <form action="/" className="feedFilters" method="get">
      <div className="searchField">
        <SearchIcon />
        <label className="srOnly" htmlFor="feed-search">Buscar projetos</label>
        <input defaultValue={filters.query} id="feed-search" name="q" placeholder="Busque por tema, código ou palavra" type="search" />
        <button type="submit">Buscar</button>
      </div>
      <details className="filterPanel" open={Object.keys(filters).length > 2}>
        <summary><span>Refinar resultados</span><span className="filterPanel__hint">fonte, situação, tema e autoria</span></summary>
        <div className="filterGrid">
          <label>Casa legislativa<select defaultValue={filters.source ?? ""} name="fonte"><option value="">Todas</option>{options.sources.map((source) => <option key={source} value={source}>{source === "camara" ? "Câmara" : "Senado"}</option>)}</select></label>
          <label>Situação atual<select defaultValue={filters.status ?? ""} name="situacao"><option value="">Todas</option>{options.statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label>Tema<select defaultValue={filters.topic ?? ""} name="tema"><option value="">Todos</option>{options.topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></label>
          <label>Partido do autor<select defaultValue={filters.party ?? ""} name="partido"><option value="">Todos</option>{options.parties.map((party) => <option key={party} value={party}>{party}</option>)}</select></label>
          <label>Parlamentar autor<input defaultValue={filters.author} list="authors" name="autor" placeholder="Nome do parlamentar" /><datalist id="authors">{options.authors.map((author) => <option key={author} value={author} />)}</datalist></label>
          <label>Ordenar por<select defaultValue={filters.order ?? "updated"} name="ordem"><option value="updated">Atividade mais recente</option><option value="presented">Apresentação mais recente</option></select></label>
        </div>
        <div className="filterActions"><a href="/">Limpar filtros</a><button type="submit">Aplicar filtros</button></div>
      </details>
    </form>
  );
}
