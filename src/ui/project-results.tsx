import type { PublicBillFilters, PublicBillPage } from "#/server/public/read-models";
import { Pagination } from "#/ui/pagination";
import { ProjectCard } from "#/ui/project-card";

export function ProjectResults({
  emptyFollowed = false,
  filters,
  onPageChange,
  projects,
}: Readonly<{
  emptyFollowed?: boolean;
  filters: PublicBillFilters;
  onPageChange?: (page: number) => void;
  projects: PublicBillPage;
}>) {
  return (
    <section className="feedResults" aria-labelledby="results-title">
      <header className="resultsHeader"><div><span className="eyebrow">Radar legislativo</span><h2 id="results-title">Projetos encontrados</h2></div><p><strong>{projects.total.toLocaleString("pt-BR")}</strong> registros oficiais</p></header>
      {projects.items.length > 0 ? (
        <div className="projectGrid">{projects.items.map((project) => <ProjectCard key={`${project.source}-${project.externalId}`} project={project} />)}</div>
      ) : emptyFollowed ? (
        <div className="emptyState"><span aria-hidden="true">○</span><h3>Você ainda não acompanha nenhum projeto.</h3><p>Abra um projeto e use o botão “Seguir projeto” para encontrá-lo aqui.</p><a href="/">Descobrir projetos</a></div>
      ) : (
        <div className="emptyState"><span aria-hidden="true">○</span><h3>Nenhum projeto apareceu com esses filtros.</h3><p>Tente remover um filtro ou buscar uma palavra mais curta.</p><a href="/">Ver todos os projetos</a></div>
      )}
      <Pagination filters={filters} onPageChange={onPageChange} page={projects.page} totalPages={projects.totalPages} />
    </section>
  );
}
