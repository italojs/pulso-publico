import { db } from "#/server/db/client";
import { listPublicBills, listPublicFilterOptions } from "#/server/public/queries";
import { parseFeedSearchParams } from "#/server/public/search-params";
import { FeedFilters } from "#/ui/feed-filters";
import { Pagination } from "#/ui/pagination";
import { ProjectCard } from "#/ui/project-card";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const filters = parseFeedSearchParams(await searchParams);
  const [projects, options] = await Promise.all([listPublicBills(db, filters), listPublicFilterOptions(db)]);

  return (
    <main id="conteudo" className="feedPage">
      <section className="feedIntro" aria-labelledby="feed-title">
        <div><span className="eyebrow">Câmara + Senado · dados oficiais</span><h1 id="feed-title">O que está mudando<br />em Brasília.</h1></div>
        <p>Projetos de lei em uma linguagem que dá para entender — com o caminho completo para você conferir cada informação.</p>
      </section>
      <FeedFilters filters={filters} options={options} />
      <section className="feedResults" aria-labelledby="results-title">
        <header className="resultsHeader"><div><span className="eyebrow">Radar legislativo</span><h2 id="results-title">Projetos encontrados</h2></div><p><strong>{projects.total.toLocaleString("pt-BR")}</strong> registros oficiais</p></header>
        {projects.items.length > 0 ? (
          <div className="projectGrid">{projects.items.map((project) => <ProjectCard key={`${project.source}-${project.externalId}`} project={project} />)}</div>
        ) : (
          <div className="emptyState"><span aria-hidden="true">○</span><h3>Nenhum projeto apareceu com esses filtros.</h3><p>Tente remover um filtro ou buscar uma palavra mais curta.</p><a href="/">Ver todos os projetos</a></div>
        )}
        <Pagination filters={filters} page={projects.page} totalPages={projects.totalPages} />
      </section>
    </main>
  );
}
