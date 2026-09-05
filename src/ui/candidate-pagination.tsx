import type { CandidateFilters } from "#/server/candidates/read-models";
import { buildCandidateHref } from "#/server/candidates/search-params";

export function CandidatePagination({ filters, page, totalPages }: Readonly<{
  filters: CandidateFilters;
  page: number;
  totalPages: number;
}>) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginação das candidaturas" className="pagination candidatePagination">
      {page > 1 ? <a href={buildCandidateHref(filters, page - 1)}>Página anterior</a> : <span />}
      <span>Página <strong>{page}</strong> de {totalPages}</span>
      {page < totalPages ? <a href={buildCandidateHref(filters, page + 1)}>Próxima página</a> : <span />}
    </nav>
  );
}
