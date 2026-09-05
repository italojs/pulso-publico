import { cookies, headers } from "next/headers.js";
import { redirect } from "next/navigation.js";

import { currentUserFromCookie } from "#/auth/current-user";
import { UserRepository } from "#/auth/user-repository";
import { inferRegion } from "#/server/candidates/inferred-region";
import { listCandidateFilterOptions, listCandidates } from "#/server/candidates/queries";
import type {
  CandidateFilters,
  CandidateRegionOrigin,
} from "#/server/candidates/read-models";
import {
  buildCandidateHref,
  parseCandidateSearchParams,
  type CandidateRawSearchParams,
} from "#/server/candidates/search-params";
import { env } from "#/server/config";
import { db } from "#/server/db/client";
import { CandidateFilters as CandidateFiltersPanel } from "#/ui/candidate-filters";
import { CandidateResults } from "#/ui/candidate-results";

export const dynamic = "force-dynamic";

const users = new UserRepository(db);

function regionScope(filters: CandidateFilters, origin: CandidateRegionOrigin) {
  if (filters.allBrazil) return <p>Abrangência: Brasil inteiro</p>;
  const selected = filters.regions?.join(", ");
  if (!selected) return null;
  return <p>{origin === "ip" ? "UF estimada" : "UF selecionada"}: {selected}</p>;
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
          {options.snapshots.length === 0 ? regionScope(filters, regionOrigin) : null}
          <p className="candidateIntro__source">Fonte: Portal de Dados Abertos do TSE.</p>
        </div>
      </section>

      {options.snapshots.length === 0 ? (
        <section className="emptyState" aria-labelledby="candidate-snapshot-empty-title">
          <span aria-hidden="true">○</span>
          <h2 id="candidate-snapshot-empty-title">Dados eleitorais ainda indisponíveis</h2>
          <p>Ainda não há um retrato eleitoral oficial disponível. O catálogo aparecerá depois da primeira sincronização válida com o TSE.</p>
        </section>
      ) : (
        <>
          <CandidateFiltersPanel
            authenticated={Boolean(user)}
            filters={filters}
            options={options}
            regionOrigin={regionOrigin}
          />
          <CandidateResults
            candidates={candidatePage}
            filters={filters}
            snapshotExtractedAt={latestDatedSnapshot?.extractedAt ?? null}
          />
        </>
      )}
    </main>
  );
}
