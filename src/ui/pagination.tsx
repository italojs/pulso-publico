import type { PublicBillFilters } from "#/server/public/read-models";
import { buildFeedHref } from "#/server/public/search-params";

export function Pagination({ filters, onPageChange, page, totalPages }: Readonly<{ filters: PublicBillFilters; onPageChange?: (page: number) => void; page: number; totalPages: number }>) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginação dos projetos" className="pagination">
      {page > 1 ? onPageChange
        ? <button onClick={() => onPageChange(page - 1)} type="button">Página anterior</button>
        : <a href={buildFeedHref(filters, page - 1)}>Página anterior</a> : <span />}
      <span>Página <strong>{page}</strong> de {totalPages}</span>
      {page < totalPages ? onPageChange
        ? <button onClick={() => onPageChange(page + 1)} type="button">Próxima página</button>
        : <a href={buildFeedHref(filters, page + 1)}>Próxima página</a> : <span />}
    </nav>
  );
}
