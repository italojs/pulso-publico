import type {
  CandidateComparisonError,
  PublicCandidateComparison,
  PublicCandidateComparisonCandidate,
  PublicCandidateComparisonHistory,
  PublicCandidateComparisonProject,
  PublicCandidateVote,
} from "#/server/candidates/read-models";
import {
  buildCandidateCatalogHref,
  buildCandidateComparisonHref,
  parseCandidateComparisonSearchParams,
} from "#/server/candidates/search-params";
import { candidateOfficeLabels } from "#/ui/candidate-office";
import { formatDate, houseLabel, sourceLabel } from "#/ui/format";

const missing = "Não informado pela fonte";

function errorMessage(error: CandidateComparisonError): string {
  if (error === "INCOMPATIBLE_CANDIDATES") {
    return "As candidaturas precisam disputar o mesmo cargo e a mesma circunscrição para serem comparadas.";
  }
  if (error === "TOO_MANY_CANDIDATES") {
    return "A comparação aceita no máximo três candidaturas. Remova uma seleção para continuar.";
  }
  return "Uma ou mais candidaturas não estão disponíveis no retrato oficial atual. Nenhuma comparação parcial foi exibida.";
}

function removalHref(year: number, ids: readonly string[], removed: string): string {
  const remaining = ids.filter((id) => id !== removed);
  if (remaining.length <= 3) return buildCandidateComparisonHref(year, remaining);

  const selection = parseCandidateComparisonSearchParams({
    ano: String(year),
    id: [...remaining],
  });
  if (!selection.valid) return "/candidatos";
  const params = new URLSearchParams({ ano: String(selection.year) });
  for (const id of selection.ids) params.append("id", id);
  return `/candidatos/comparar?${params.toString()}`;
}

function ComparisonSelection({ candidates, selectedIds, year }: Readonly<{
  candidates: PublicCandidateComparisonCandidate[];
  selectedIds: readonly string[];
  year: number;
}>) {
  const names = new Map(candidates.map((candidate) => [candidate.externalId, candidate.ballotName]));
  if (!selectedIds.length) return null;
  return (
    <nav aria-label="Editar seleção comparada" className="candidateComparison__selection">
      <ul>
        {selectedIds.map((id) => (
          <li key={id}>
            <span>{names.get(id) ?? `Candidatura ${id}`}</span>
            <a aria-label={`Remover candidatura ${id}`} href={removalHref(year, selectedIds, id)}>Remover</a>
          </li>
        ))}
      </ul>
      <a href={selectedIds.length <= 3
        ? buildCandidateCatalogHref({}, 1, { year, ids: [...selectedIds] })
        : "/candidatos"}>Alterar seleção no catálogo</a>
    </nav>
  );
}

const identityRows = [
  ["Nome civil", (candidate: PublicCandidateComparisonCandidate) => candidate.fullName],
  ["Número", (candidate: PublicCandidateComparisonCandidate) => String(candidate.number)],
  ["Cargo", (candidate: PublicCandidateComparisonCandidate) => candidateOfficeLabels[candidate.office]],
  ["UF", (candidate: PublicCandidateComparisonCandidate) => candidate.region],
  ["Circunscrição", (candidate: PublicCandidateComparisonCandidate) => candidate.electoralUnit],
  ["Partido", (candidate: PublicCandidateComparisonCandidate) => `${candidate.partyAcronym} · ${candidate.partyName}`],
  ["Situação oficial", (candidate: PublicCandidateComparisonCandidate) => candidate.status],
] as const;

function IdentityComparison({ candidates }: Readonly<{ candidates: PublicCandidateComparisonCandidate[] }>) {
  return (
    <section aria-labelledby="comparison-identity-title" className="candidateComparison__identity">
      <div className="candidateComparison__sectionHeader">
        <span className="eyebrow">Quem está na comparação</span>
        <h2 id="comparison-identity-title">Identidade eleitoral</h2>
      </div>
      <div className="candidateComparison__desktop tableScroll">
        <table aria-label="Identidade eleitoral comparada">
          <thead>
            <tr>
              <th scope="col">Campo</th>
              {candidates.map((candidate) => <th key={candidate.externalId} scope="col">{candidate.ballotName}</th>)}
            </tr>
          </thead>
          <tbody>
            {identityRows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {candidates.map((candidate) => <td key={candidate.externalId}>{value(candidate) || missing}</td>)}
              </tr>
            ))}
            <tr>
              <th scope="row">Fonte eleitoral</th>
              {candidates.map((candidate) => (
                <td key={candidate.externalId}>
                  <a href={candidate.officialUrl}>Abrir candidatura de {candidate.ballotName} no TSE</a>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="candidateComparison__mobile">
        {candidates.map((candidate) => (
          <article aria-label={`Identidade de ${candidate.ballotName}`} key={candidate.externalId}>
            <header>
              <strong aria-label={`Número de urna ${candidate.number}`}>{candidate.number}</strong>
              <h3>{candidate.ballotName}</h3>
            </header>
            <dl>
              {identityRows.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value(candidate) || missing}</dd></div>
              ))}
            </dl>
            <a href={candidate.officialUrl}>Abrir candidatura no TSE</a>
          </article>
        ))}
      </div>
    </section>
  );
}

function projectRole(project: PublicCandidateComparisonProject): string {
  if (project.primary && project.coauthored) return "Autoria principal e coautoria registradas";
  if (project.primary) return "Autoria principal";
  return "Coautoria";
}

function ProjectEvidence({ candidate, history }: Readonly<{
  candidate: PublicCandidateComparisonCandidate;
  history: PublicCandidateComparisonHistory;
}>) {
  return (
    <div className="candidateComparison__evidenceBlock">
      <header>
        <h4>{candidate.ballotName}</h4>
        <p>{history.projectCount.toLocaleString("pt-BR")} {history.projectCount === 1 ? "projeto armazenado" : "projetos armazenados"}</p>
      </header>
      {history.projects.items.length ? (
        <ol>
          {history.projects.items.map((project) => (
            <li key={`${project.source}-${project.externalId}`}>
              <p className="candidateComparison__recordMeta">{projectRole(project)} · {sourceLabel(project.source)}</p>
              <h5>{project.officialCode} · {project.officialTitle}</h5>
              <dl>
                <div><dt>Tipo / número / ano</dt><dd>{project.proposalType ?? missing} / {project.proposalNumber ?? missing} / {project.proposalYear ?? missing}</dd></div>
                <div><dt>Apresentação</dt><dd>{project.presentedAt ? formatDate(project.presentedAt) : missing}</dd></div>
                <div><dt>Casa</dt><dd>{houseLabel(project.chamber)}</dd></div>
                <div><dt>Situação</dt><dd>{project.statusLabel || missing}</dd></div>
                <div><dt>Temas</dt><dd>{project.topics.length ? project.topics.join(" · ") : missing}</dd></div>
              </dl>
              <a
                aria-label={`Abrir ${project.officialCode} na ${sourceLabel(project.source)}`}
                href={project.officialUrl}
              >Abrir fonte oficial</a>
            </li>
          ))}
        </ol>
      ) : <p className="candidateComparison__absence">Nenhum projeto proposto ou coautorado consta nos registros armazenados.</p>}
      {history.projects.truncated ? (
        <p className="candidateComparison__bounded">
          Exibindo {history.projects.items.length.toLocaleString("pt-BR")} de {history.projects.total.toLocaleString("pt-BR")} projetos armazenados.
        </p>
      ) : null}
    </div>
  );
}

function VoteEvidence({ candidate, history }: Readonly<{
  candidate: PublicCandidateComparisonCandidate;
  history: PublicCandidateComparisonHistory;
}>) {
  return (
    <div className="candidateComparison__evidenceBlock">
      <header>
        <h4>{candidate.ballotName}</h4>
        <p>{history.voteCount.toLocaleString("pt-BR")} {history.voteCount === 1 ? "voto individual armazenado" : "votos individuais armazenados"}</p>
      </header>
      {history.votes.items.length ? (
        <ol>
          {history.votes.items.map((vote: PublicCandidateVote) => (
            <li key={`${vote.source}-${vote.externalId}`}>
              <p className="candidateComparison__recordMeta">Voto: {vote.rawChoice || missing}</p>
              <h5>{vote.description}</h5>
              <p>{vote.bill.officialCode} · {vote.bill.officialTitle}</p>
              <dl>
                <div><dt>Data</dt><dd>{formatDate(vote.occurredAt)}</dd></div>
                <div><dt>Casa</dt><dd>{houseLabel(vote.house)}</dd></div>
                <div><dt>Escolha registrada</dt><dd>{vote.rawChoice || missing}</dd></div>
                <div><dt>Resultado geral</dt><dd>Resultado geral: {vote.result ?? missing}</dd></div>
              </dl>
              <a
                aria-label={`Abrir registro oficial da votação na ${sourceLabel(vote.source)}`}
                href={vote.officialUrl}
              >Abrir fonte oficial</a>
            </li>
          ))}
        </ol>
      ) : <p className="candidateComparison__absence">Nenhum voto individual consta nos registros armazenados.</p>}
      {history.votes.truncated ? (
        <p className="candidateComparison__bounded">
          Exibindo {history.votes.items.length.toLocaleString("pt-BR")} de {history.votes.total.toLocaleString("pt-BR")} votos individuais armazenados.
        </p>
      ) : null}
    </div>
  );
}

function EvidenceCandidate({ candidate, kind }: Readonly<{
  candidate: PublicCandidateComparisonCandidate;
  kind: "projects" | "votes";
}>) {
  if (!candidate.history) {
    return (
      <div className="candidateComparison__evidenceBlock">
        <h4>{candidate.ballotName}</h4>
        <p className="candidateComparison__absence">Não há histórico parlamentar confirmado</p>
      </div>
    );
  }
  return kind === "projects"
    ? <ProjectEvidence candidate={candidate} history={candidate.history} />
    : <VoteEvidence candidate={candidate} history={candidate.history} />;
}

function coverageText(history: PublicCandidateComparisonHistory): string {
  const dates = [
    history.coverage.projectFrom,
    history.coverage.projectTo,
    history.coverage.voteFrom,
    history.coverage.voteTo,
  ].filter((date): date is string => Boolean(date)).toSorted();
  if (!dates.length) return "Datas de cobertura não informadas nos registros armazenados.";
  return `Cobertura dos registros armazenados: ${formatDate(dates[0]!)} a ${formatDate(dates.at(-1)!)}.`;
}

export function CandidateComparison({ result, selectedIds, year }: Readonly<{
  result: PublicCandidateComparison;
  selectedIds: readonly string[];
  year: number;
}>) {
  const candidates = "candidates" in result ? result.candidates : [];
  return (
    <main className="candidateComparison" id="conteudo">
      <header className="candidateComparison__intro">
        <span className="eyebrow">Eleições {year} · evidências oficiais</span>
        <h1>Compare a atuação registrada</h1>
        <p>Coloque lado a lado projetos propostos ou coautorados e votos individuais vinculados a fontes oficiais.</p>
        {selectedIds.length < 2 ? <p className="candidateComparison__instruction">Escolha de uma a três candidaturas no catálogo.</p> : null}
      </header>

      <ComparisonSelection candidates={candidates} selectedIds={selectedIds} year={year} />

      {"error" in result ? (
        <section aria-live="polite" className="candidateComparison__error">
          <h2>Não foi possível montar a comparação</h2>
          <p>{errorMessage(result.error)}</p>
        </section>
      ) : candidates.length === 0 ? (
        <section className="candidateComparison__empty">
          <h2>Comece pelo catálogo</h2>
          <p>Selecione candidaturas para consultar evidências do mesmo cargo e circunscrição.</p>
          <a href="/candidatos">Escolher candidaturas</a>
        </section>
      ) : (
        <>
          <IdentityComparison candidates={candidates} />
          <section aria-labelledby="comparison-projects-title" className="candidateComparison__evidence">
            <div className="candidateComparison__sectionHeader">
              <span className="eyebrow">Autoria oficial</span>
              <h2 id="comparison-projects-title">Projetos propostos ou coautorados</h2>
            </div>
            <div className="candidateComparison__columns">
              {candidates.map((candidate) => <EvidenceCandidate candidate={candidate} kind="projects" key={candidate.externalId} />)}
            </div>
          </section>
          <section aria-labelledby="comparison-votes-title" className="candidateComparison__evidence">
            <div className="candidateComparison__sectionHeader">
              <span className="eyebrow">Registros nominais</span>
              <h2 id="comparison-votes-title">Como votou</h2>
            </div>
            <div className="candidateComparison__columns">
              {candidates.map((candidate) => <EvidenceCandidate candidate={candidate} kind="votes" key={candidate.externalId} />)}
            </div>
          </section>
          <aside className="candidateComparison__scope">
            <strong>Sobre a cobertura</strong>
            <p>Este é um recorte dos registros oficiais armazenados, não uma carreira política completa.</p>
            <ul>
              {candidates.map((candidate) => (
                <li key={candidate.externalId}>
                  <span>{candidate.ballotName}: {candidate.history ? coverageText(candidate.history) : "Não há histórico parlamentar confirmado."}</span>{" "}
                  <a href={candidate.profileUrl}>Ver todos os registros de {candidate.ballotName}</a>
                </li>
              ))}
            </ul>
          </aside>
        </>
      )}
    </main>
  );
}
