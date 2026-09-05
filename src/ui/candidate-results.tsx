import type {
  CandidateFilters,
  PublicCandidateComparisonChoice,
  PublicCandidatePage,
} from "#/server/candidates/read-models";
import {
  buildCandidateCatalogHref,
  buildCandidateHref,
  type CandidateComparisonSelection,
} from "#/server/candidates/search-params";
import { CandidateComparePicker } from "#/ui/candidate-compare-picker";
import { CandidatePagination } from "#/ui/candidate-pagination";
import { formatDateTime } from "#/ui/format";

export function CandidateResults({ candidates, comparison, initialComparedCandidates = [], filters, snapshotExtractedAt }: Readonly<{
  candidates: PublicCandidatePage;
  comparison?: CandidateComparisonSelection;
  initialComparedCandidates?: PublicCandidateComparisonChoice[];
  filters: CandidateFilters;
  snapshotExtractedAt: string | null;
}>) {
  const resetHref = buildCandidateCatalogHref(filters.allBrazil ? { allBrazil: true } : {}, 1, comparison);
  const catalogHref = buildCandidateHref(filters, candidates.page);
  return (
    <section aria-labelledby="candidate-results-title" className="feedResults candidateResults">
      <header className="resultsHeader">
        <div>
          <span className="eyebrow">Retrato oficial do TSE</span>
          <h2 id="candidate-results-title">Candidaturas encontradas</h2>
        </div>
        <p>
          <strong>{candidates.total.toLocaleString("pt-BR")}</strong>{" "}
          <span>{candidates.total === 1 ? "candidatura oficial" : "candidaturas oficiais"}</span>
          {snapshotExtractedAt ? <> · atualizado em <time dateTime={snapshotExtractedAt}>{formatDateTime(snapshotExtractedAt)}</time></> : null}
        </p>
      </header>
      <CandidateComparePicker
        candidates={candidates.items}
        catalogHref={catalogHref}
        initialCandidates={initialComparedCandidates}
      />
      {!candidates.items.length ? (
        <div className="emptyState">
          <span aria-hidden="true">○</span>
          <h3>Nenhuma candidatura apareceu com esses filtros.</h3>
          <p>Remova um critério ou amplie a região para consultar outros registros oficiais.</p>
          <a href={resetHref}>Ver todas as candidaturas</a>
        </div>
      ) : null}
      <CandidatePagination comparison={comparison} filters={filters} page={candidates.page} totalPages={candidates.totalPages} />
    </section>
  );
}
