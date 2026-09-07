import { notFound } from "next/navigation.js";

import type { LegislativeSourceName } from "#/domain/legislative";
import { db } from "#/server/db/client";
import { getPublicBill } from "#/server/public/queries";
import { formatDateTime, houseLabel } from "#/ui/format";
import { FollowButton } from "#/ui/follow-button";
import { ExternalIcon } from "#/ui/icons";
import { ProjectTimeline } from "#/ui/project-timeline";
import { SourceBadge } from "#/ui/source-badge";
import { StatusRail } from "#/ui/status-rail";
import { VoteEventCard } from "#/ui/vote-event";

export const dynamic = "force-dynamic";

function validSource(value: string): value is LegislativeSourceName {
  return value === "camara" || value === "senado";
}

export default async function ProjectPage({ params }: Readonly<{ params: Promise<{ source: string; externalId: string }> }>) {
  const { source, externalId } = await params;
  if (!validSource(source)) notFound();
  const project = await getPublicBill(db, source, externalId);
  if (!project) notFound();

  return (
    <main id="conteudo" className="detailPage">
      <nav aria-label="Caminho de navegação" className="breadcrumb"><a href="/">Projetos</a><span>/</span><span aria-current="page">{project.officialCode}</span></nav>
      <header className="projectHero">
        <div className="projectHero__meta"><SourceBadge source={project.source} /><span>{project.officialCode}</span><span>{houseLabel(project.currentHouse)}</span></div>
        <StatusRail source={project.source} status={project.statusLabel} />
        {project.friendlyTitle || project.shortDescription ? <section className="aiSummary" aria-labelledby="ai-summary-title"><span className="aiLabel">Gerado por IA</span>{project.friendlyTitle ? <h1 id="ai-summary-title">{project.friendlyTitle}</h1> : null}{project.shortDescription ? <p>{project.shortDescription}</p> : null}<small>Uma explicação curta baseada somente no título e na ementa oficiais abaixo.</small></section> : null}
        <div className="officialBlock"><span className="officialLabel">Título e ementa oficiais</span><h1>{project.officialTitle}</h1>{project.officialSummary ? <p>{project.officialSummary}</p> : null}</div>
        <div className="projectHero__actions"><FollowButton kind="bill" source={project.source} externalId={project.externalId} label={project.officialCode} href={`/projetos/${project.source}/${project.externalId}`} subtitle={project.statusLabel} /><a href={project.officialUrl} rel="noreferrer" target="_blank">Abrir na fonte oficial <ExternalIcon /></a></div>
      </header>

      <section className="factsBar" aria-label="Informações principais">
        <dl><div><dt>Identificação</dt><dd>{project.officialCode}</dd></div><div><dt>Casa de origem</dt><dd>{houseLabel(project.originHouse)}</dd></div><div><dt>Temas oficiais</dt><dd>{project.topics.join(", ") || "Não informados"}</dd></div><div><dt>Última conferência</dt><dd>{formatDateTime(project.checkedAt)}</dd></div></dl>
      </section>

      <div className="detailColumns">
        <aside className="detailSidebar">
          <section><span className="eyebrow">Quem apresentou</span><h2>Autoria oficial</h2>{project.authors.length ? <ul className="authorList">{project.authors.map((author) => <li key={`${author.source}-${author.name}`}>{author.lawmakerExternalId ? <a href={`/parlamentares/${author.source}/${author.lawmakerExternalId}`}>{author.name}</a> : <strong>{author.name}</strong>}<span>{[author.kind, author.party].filter(Boolean).join(" · ")}</span></li>)}</ul> : <p className="sectionEmpty">Autoria não informada pela fonte.</p>}</section>
          <section className="trustNote"><strong>Como ler esta página</strong><p>Datas, situação, autoria e votos vêm dos registros oficiais. O Pulso Público não avalia nem recomenda posições políticas.</p></section>
        </aside>
        <div className="detailMain">
          <section className="detailSection"><header className="sectionHeader"><span className="eyebrow">Separado por casa legislativa</span><h2>Linha do tempo</h2><p>{project.timeline.length} movimentações oficiais</p></header><ProjectTimeline items={project.timeline} /></section>
          <section className="detailSection" id="votacoes"><header className="sectionHeader"><span className="eyebrow">Decisões registradas</span><h2>Votações</h2><p>{project.voteEvents.length} votações relacionadas</p></header>{project.voteEvents.length ? <div className="voteStack">{project.voteEvents.map((event) => <VoteEventCard event={event} key={event.externalId} />)}</div> : <p className="sectionEmpty">Ainda não há votações associadas a esta matéria na fonte consultada.</p>}</section>
        </div>
      </div>
    </main>
  );
}
