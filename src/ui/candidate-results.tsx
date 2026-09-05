import type { CandidateFilters, PublicCandidatePage } from "#/server/candidates/read-models";
import { buildCandidateHref } from "#/server/candidates/search-params";
import { CandidateCard } from "#/ui/candidate-card";
import { CandidatePagination } from "#/ui/candidate-pagination";
import { formatDateTime } from "#/ui/format";

export function CandidateResults({ candidates, filters, snapshotExtractedAt }: Readonly<{
  candidates: PublicCandidatePage;
  filters: CandidateFilters;
  snapshotExtractedAt: string | null;
}>) {
  const resetHref = buildCandidateHref(filters.allBrazil ? { allBrazil: true } : {}, 1);
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
      {candidates.items.length ? (
        <div className="candidateGrid">
          {candidates.items.map((candidate) => (
            <CandidateCard candidate={candidate} key={`${candidate.electionYear}-${candidate.externalId}`} />
          ))}
        </div>
      ) : (
        <div className="emptyState">
          <span aria-hidden="true">○</span>
          <h3>Nenhuma candidatura apareceu com esses filtros.</h3>
          <p>Remova um critério ou amplie a região para consultar outros registros oficiais.</p>
          <a href={resetHref}>Ver todas as candidaturas</a>
        </div>
      )}
      <CandidatePagination filters={filters} page={candidates.page} totalPages={candidates.totalPages} />
    </section>
  );
}
