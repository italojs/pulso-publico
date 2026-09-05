import type {
  PublicCandidateHistoryPage,
  PublicCandidateProject,
  PublicCandidateVote,
  PublicConfirmedCandidateHistory,
} from "#/server/candidates/read-models";
import { formatDate, sourceLabel } from "#/ui/format";

const choiceLabels: Record<PublicCandidateVote["choice"], string> = {
  sim: "Sim",
  nao: "Não",
  abstencao: "Abstenção",
  obstrucao: "Obstrução",
  outro: "Outro",
  indisponivel: "Indisponível na fonte",
};

function coverageDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric", month: "short", year: "numeric", timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function coverageLine(label: string, from: string | null, to: string | null): string {
  if (!from || !to) return `${label}: datas não disponíveis nos registros armazenados.`;
  return `${label}: de ${coverageDate(from)} a ${coverageDate(to)}.`;
}

function historyHref(basePath: string, projectPage: number, votePage: number): string {
  const params = new URLSearchParams();
  if (projectPage > 1) params.set("projetosPagina", String(projectPage));
  if (votePage > 1) params.set("votosPagina", String(votePage));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function PageLinks<T>({
  basePath,
  label,
  page,
  otherPage,
  kind,
}: Readonly<{
  basePath: string;
  label: string;
  page: PublicCandidateHistoryPage<T>;
  otherPage: number;
  kind: "projects" | "votes";
}>) {
  if (page.totalPages <= 1) return null;
  const pageHref = (target: number) => kind === "projects"
    ? historyHref(basePath, target, otherPage)
    : historyHref(basePath, otherPage, target);
  return (
    <nav aria-label={`Paginação de ${label}`} className="candidateHistory__pagination">
      {page.page > 1 ? <a href={pageHref(page.page - 1)}>{kind === "projects" ? "Projetos anteriores" : "Votos anteriores"}</a> : <span />}
      <span>Página {page.page} de {page.totalPages}</span>
      {page.page < page.totalPages ? <a href={pageHref(page.page + 1)}>{kind === "projects" ? "Próximos projetos" : "Próximos votos"}</a> : null}
    </nav>
  );
}

function CandidateProjects({ history, basePath }: Readonly<{ history: PublicConfirmedCandidateHistory; basePath: string }>) {
  return (
    <section className="candidateHistory__block" aria-labelledby="candidate-projects-title">
      <header><h3 id="candidate-projects-title">Projetos associados</h3><p>{history.projectCount.toLocaleString("pt-BR")} projetos distintos</p></header>
      <p className="candidateHistory__counts">
        {history.primaryProjectCount.toLocaleString("pt-BR")} com autoria principal · {history.coauthoredProjectCount.toLocaleString("pt-BR")} com coautoria registrada
      </p>
      {history.projects.items.length ? (
        <div className="tableScroll"><table aria-label="Projetos de autoria parlamentar confirmada">
          <thead><tr><th scope="col">Projeto</th><th scope="col">Autoria registrada</th><th scope="col">Data</th><th scope="col">Fonte</th></tr></thead>
          <tbody>{history.projects.items.map((project: PublicCandidateProject) => (
            <tr key={`${project.source}-${project.externalId}`}>
              <th scope="row"><a href={`/projetos/${project.source}/${encodeURIComponent(project.externalId)}`}>{project.officialCode}: {project.officialTitle}</a></th>
              <td>{[project.primary ? "Autoria principal" : null, project.coauthored ? "Coautoria" : null].filter(Boolean).join(" e ")}</td>
              <td>{project.presentedAt ? formatDate(project.presentedAt) : "Não informada"}</td>
              <td><a href={project.officialUrl} rel="noreferrer" target="_blank">{sourceLabel(project.source)}</a></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="sectionEmpty">Nenhum projeto alcança esta página dos registros armazenados.</p>}
      <PageLinks basePath={basePath} kind="projects" label="projetos" otherPage={history.votes.page} page={history.projects} />
    </section>
  );
}

function CandidateVotes({ history, basePath }: Readonly<{ history: PublicConfirmedCandidateHistory; basePath: string }>) {
  const distribution = Object.entries(history.voteDistribution) as Array<[PublicCandidateVote["choice"], number]>;
  const maximum = distribution.reduce((largest, [, total]) => Math.max(largest, total), 0);
  return (
    <section className="candidateHistory__block" aria-labelledby="candidate-votes-title">
      <header><h3 id="candidate-votes-title">Votos nominais registrados</h3><p>{history.voteCount.toLocaleString("pt-BR")} registros individuais</p></header>
      <div className="candidateVoteDistribution">
        <div aria-hidden="true" className="candidateBars">{distribution.map(([choice, total]) => <span key={choice} style={{
          "--candidate-bar": `${maximum === 0 ? 0 : Math.floor((total * 100) / maximum)}%`,
        } as React.CSSProperties} />)}</div>
        <div className="tableScroll"><table aria-label="Distribuição dos votos nominais">
          <thead><tr><th scope="col">Escolha registrada</th><th scope="col">Quantidade</th></tr></thead>
          <tbody>{distribution.map(([choice, total]) => <tr key={choice}><th scope="row">{choiceLabels[choice]}</th><td>{total.toLocaleString("pt-BR")}</td></tr>)}</tbody>
        </table></div>
      </div>
      {history.votes.items.length ? (
        <div className="tableScroll"><table aria-label="Votos individuais oficiais">
          <thead><tr><th scope="col">Projeto e votação</th><th scope="col">Voto oficial</th><th scope="col">Data</th><th scope="col">Fonte</th></tr></thead>
          <tbody>{history.votes.items.map((vote) => (
            <tr key={`${vote.source}-${vote.externalId}`}>
              <th scope="row"><a href={`/projetos/${vote.bill.source}/${encodeURIComponent(vote.bill.externalId)}`}>{vote.bill.officialCode}: {vote.description}</a></th>
              <td>{vote.rawChoice}</td>
              <td>{formatDate(vote.occurredAt)}</td>
              <td><a href={vote.officialUrl} rel="noreferrer" target="_blank">{sourceLabel(vote.source)}</a></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="sectionEmpty">Nenhum registro individual está disponível nesta página da janela armazenada.</p>}
      <PageLinks basePath={basePath} kind="votes" label="votos" otherPage={history.projects.page} page={history.votes} />
    </section>
  );
}

export function CandidateHistory({
  history,
  basePath,
}: Readonly<{ history: PublicConfirmedCandidateHistory | null; basePath: string }>) {
  return (
    <section className="candidateDossier__section" aria-labelledby="candidate-history-title">
      <header className="candidateDossier__sectionHeader">
        <span className="eyebrow">Somente vínculos confirmados</span>
        <h2 id="candidate-history-title">Histórico parlamentar confirmado</h2>
      </header>
      {!history ? (
        <p className="sectionEmpty">Não existe histórico parlamentar confirmado para esta candidatura.</p>
      ) : (
        <>
          <ul className="candidateHistory__lawmakers" aria-label="Perfis parlamentares confirmados">
            {history.lawmakers.map((lawmaker) => <li key={`${lawmaker.source}-${lawmaker.externalId}`}>
              <strong>{lawmaker.electoralName}</strong>
              <span>{sourceLabel(lawmaker.source)} · {lawmaker.active ? "mandato em exercício" : "mandato anterior"}</span>
              <a href={lawmaker.officialUrl} rel="noreferrer" target="_blank">Perfil oficial na {sourceLabel(lawmaker.source)}</a>
            </li>)}
          </ul>
          <aside className="candidateCoverage" aria-label="Cobertura do histórico">
            <strong>Cobertura baseada nos registros armazenados</strong>
            <p>{coverageLine("Projetos", history.coverage.projectFrom, history.coverage.projectTo)}</p>
            <p>{coverageLine("Votos nominais", history.coverage.voteFrom, history.coverage.voteTo)}</p>
            <small>Esta janela não representa necessariamente toda a carreira política.</small>
          </aside>
          {history.topics.length ? <p className="candidateHistory__topics"><strong>Temas oficiais encontrados:</strong> {history.topics.join(", ")}</p> : null}
          <CandidateProjects basePath={basePath} history={history} />
          <CandidateVotes basePath={basePath} history={history} />
        </>
      )}
    </section>
  );
}
