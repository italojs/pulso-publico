import { cookies, headers } from "next/headers.js";
import { redirect } from "next/navigation.js";

import { currentUserFromCookie } from "#/auth/current-user";
import { UserRepository } from "#/auth/user-repository";
import type { CandidateOffice } from "#/domain/electoral";
import { inferRegion } from "#/server/candidates/inferred-region";
import { listCandidateFilterOptions, listCandidates } from "#/server/candidates/queries";
import type {
  CandidateFilters,
  CandidateRegionOrigin,
  PublicCandidateCard,
} from "#/server/candidates/read-models";
import {
  buildCandidateHref,
  parseCandidateSearchParams,
  type CandidateRawSearchParams,
} from "#/server/candidates/search-params";
import { env } from "#/server/config";
import { db } from "#/server/db/client";
import { formatDateTime } from "#/ui/format";

export const dynamic = "force-dynamic";

const users = new UserRepository(db);

const officeLabels: Record<CandidateOffice, string> = {
  presidente: "Presidente",
  vice_presidente: "Vice-presidente",
  governador: "Governador",
  vice_governador: "Vice-governador",
  senador: "Senador",
  primeiro_suplente: "1º suplente",
  segundo_suplente: "2º suplente",
  deputado_federal: "Deputado federal",
  deputado_estadual: "Deputado estadual",
  deputado_distrital: "Deputado distrital",
};

function regionScope(filters: CandidateFilters, origin: CandidateRegionOrigin) {
  if (filters.allBrazil) return <p>Abrangência: Brasil inteiro</p>;
  const selected = filters.regions?.join(", ");
  if (!selected) return null;
  return <p>{origin === "ip" ? "UF estimada" : "UF selecionada"}: {selected}</p>;
}

function CandidateSummary({ candidate }: Readonly<{ candidate: PublicCandidateCard }>) {
  return (
    <article className="projectCard">
      <div className="projectCard__content">
        <span className="officialLabel">Dados oficiais do TSE</span>
        <h2>
          <a href={`/candidatos/${candidate.electionYear}/${candidate.externalId}`}>
            {candidate.ballotName}
          </a>
        </h2>
        <p className="projectCard__summary">{candidate.fullName}</p>
        <p>Número {candidate.number} · {officeLabels[candidate.office]} · {candidate.region} · {candidate.partyAcronym}</p>
        <p>Situação oficial: {candidate.status}</p>
      </div>
    </article>
  );
}

export default async function CandidateCatalogPage({
  searchParams,
}: Readonly<{ searchParams: Promise<CandidateRawSearchParams> }>) {
  const explicit = parseCandidateSearchParams(await searchParams);
  const user = await currentUserFromCookie((await cookies()).toString(), users);

  if (explicit.followedOnly && !user) {
    const returnUrl = buildCandidateHref(explicit, explicit.page ?? 1);
    redirect(`/entrar?next=${encodeURIComponent(returnUrl)}`);
  }

  const inferred = explicit.regions?.length || explicit.allBrazil
    ? undefined
    : inferRegion(await headers(), env.GEO_PROVIDER);
  const filters: CandidateFilters = inferred
    ? { ...explicit, regions: [inferred] }
    : explicit;
  const regionOrigin: CandidateRegionOrigin = explicit.regions?.length
    ? "url"
    : inferred
      ? "ip"
      : undefined;
  const scope = user ? { userId: user.id } : {};
  const [candidatePage, options] = await Promise.all([
    listCandidates(db, filters, scope),
    listCandidateFilterOptions(db),
  ]);
  const latestDatedSnapshot = options.snapshots
    .filter((snapshot): snapshot is { electionYear: number; extractedAt: string } => Boolean(snapshot.extractedAt))
    .toSorted((left, right) => right.extractedAt.localeCompare(left.extractedAt))[0];

  return (
    <main id="conteudo" className="feedPage">
      <section className="feedIntro" aria-labelledby="candidate-catalog-title">
        <div>
          <span className="eyebrow">Eleições 2026 · dados oficiais</span>
          <h1 id="candidate-catalog-title">Conheça as candidaturas</h1>
        </div>
        <div>
          <p>Consulte fatos declarados ao TSE para encontrar candidaturas sem notas, rankings ou indicação de voto.</p>
          {regionScope(filters, regionOrigin)}
        </div>
      </section>

      {options.snapshots.length === 0 ? (
        <section className="emptyState" aria-labelledby="candidate-snapshot-empty-title">
          <span aria-hidden="true">○</span>
          <h2 id="candidate-snapshot-empty-title">Dados eleitorais ainda indisponíveis</h2>
          <p>Ainda não há um retrato eleitoral oficial disponível. O catálogo aparecerá depois da primeira sincronização válida com o TSE.</p>
        </section>
      ) : (
        <section className="feedResults" aria-labelledby="candidate-results-title">
          <header className="resultsHeader">
            <div>
              <span className="eyebrow">Retrato oficial do TSE</span>
              <h2 id="candidate-results-title">Candidaturas encontradas</h2>
            </div>
            <p>
              <strong>{candidatePage.total.toLocaleString("pt-BR")}</strong>{" "}
              {candidatePage.total === 1 ? "candidatura encontrada" : "candidaturas encontradas"}
              {latestDatedSnapshot ? (
                <> · <time dateTime={latestDatedSnapshot.extractedAt}>{formatDateTime(latestDatedSnapshot.extractedAt)}</time></>
              ) : null}
            </p>
          </header>
          {candidatePage.items.length > 0 ? (
            <div className="projectGrid">
              {candidatePage.items.map((candidate) => (
                <CandidateSummary
                  candidate={candidate}
                  key={`${candidate.electionYear}-${candidate.externalId}`}
                />
              ))}
            </div>
          ) : (
            <div className="emptyState">
              <span aria-hidden="true">○</span>
              <h3>Nenhuma candidatura apareceu com esses filtros.</h3>
              <p>Tente remover um critério ou mostrar o Brasil inteiro.</p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
