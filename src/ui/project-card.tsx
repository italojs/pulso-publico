import type { PublicBillCard } from "#/server/public/read-models";
import { formatDate, houseLabel } from "#/ui/format";
import { ArrowIcon } from "#/ui/icons";
import { FollowButton } from "#/ui/follow-button";
import { SourceBadge } from "#/ui/source-badge";
import { StatusRail } from "#/ui/status-rail";

export type SummarizedBillCard = PublicBillCard & {
  friendlyTitle?: string | null;
  shortDescription?: string | null;
};

export function ProjectCard({ project }: Readonly<{ project: SummarizedBillCard }>) {
  const hasAiSummary = Boolean(project.friendlyTitle || project.shortDescription);
  const title = project.friendlyTitle || project.officialTitle;
  const description = project.shortDescription || project.officialSummary;

  return (
    <article className="projectCard">
      <div className="projectCard__topline">
        <SourceBadge source={project.source} />
        <div className="projectCard__topActions">{project.latestActivityAt ? <time dateTime={project.latestActivityAt}>Atualizado em {formatDate(project.latestActivityAt)}</time> : <span>Atividade oficial não disponível</span>}<FollowButton compact kind="bill" source={project.source} externalId={project.externalId} label={project.officialCode} href={`/projetos/${project.source}/${project.externalId}`} subtitle={project.statusLabel} /></div>
      </div>
      <StatusRail compact source={project.source} status={project.statusLabel} />
      <div className="projectCard__content">
        {hasAiSummary ? <span className="aiLabel">Gerado por IA</span> : <span className="officialLabel">Título oficial</span>}
        <h2>
          <a href={`/projetos/${project.source}/${project.externalId}`}>
            <span className="projectCard__code">{project.officialCode}</span>
            {title}
          </a>
        </h2>
        {description ? <p className="projectCard__summary">{description}</p> : null}
        <dl className="projectCard__facts">
          <div>
            <dt>Casa atual</dt>
            <dd>{houseLabel(project.currentHouse)}</dd>
          </div>
          <div>
            <dt>Tema</dt>
            <dd>{project.topics[0] ?? "Não classificado"}</dd>
          </div>
          <div>
            <dt>Autoria</dt>
            <dd>
              {project.authors[0]
                ? `${project.authors[0].name}${project.authors[0].party ? ` · ${project.authors[0].party}` : ""}`
                : "Não informada"}
            </dd>
          </div>
        </dl>
        <a className="projectCard__action" href={`/projetos/${project.source}/${project.externalId}`}>
          Ver tramitação completa <ArrowIcon />
        </a>
      </div>
    </article>
  );
}
