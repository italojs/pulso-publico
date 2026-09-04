import type { PublicBillFilters } from "#/server/public/read-models";
import { buildFeedHref } from "#/server/public/search-params";

export function Pagination({ filters, page, totalPages }: Readonly<{ filters: PublicBillFilters; page: number; totalPages: number }>) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginação dos projetos" className="pagination">
      {page > 1 ? <a href={buildFeedHref(filters, page - 1)}>Página anterior</a> : <span />}
      <span>Página <strong>{page}</strong> de {totalPages}</span>
      {page < totalPages ? <a href={buildFeedHref(filters, page + 1)}>Próxima página</a> : <span />}
    </nav>
  );
}
