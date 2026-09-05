import type { CandidateFilters } from "#/server/candidates/read-models";
import {
  buildCandidateCatalogHref,
  type CandidateComparisonSelection,
} from "#/server/candidates/search-params";

export function CandidatePagination({ comparison, filters, page, totalPages }: Readonly<{
  comparison?: CandidateComparisonSelection;
  filters: CandidateFilters;
  page: number;
  totalPages: number;
}>) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginação das candidaturas" className="pagination candidatePagination">
      {page > 1 ? <a href={buildCandidateCatalogHref(filters, page - 1, comparison)}>Página anterior</a> : <span />}
      <span>Página <strong>{page}</strong> de {totalPages}</span>
      {page < totalPages ? <a href={buildCandidateCatalogHref(filters, page + 1, comparison)}>Próxima página</a> : <span />}
    </nav>
  );
}
