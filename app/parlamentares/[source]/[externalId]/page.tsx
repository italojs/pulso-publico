import { notFound } from "next/navigation.js";

import type { LegislativeSourceName } from "#/domain/legislative";
import { db } from "#/server/db/client";
import { getPublicLawmaker } from "#/server/public/queries";
import { formatDateTime, roleLabel } from "#/ui/format";
import { FollowButton } from "#/ui/follow-button";
import { ExternalIcon } from "#/ui/icons";
import { LawmakerVoteCard } from "#/ui/lawmaker-vote";
import { ProjectCard } from "#/ui/project-card";
import { SourceBadge } from "#/ui/source-badge";

export const dynamic = "force-dynamic";

function validSource(value: string): value is LegislativeSourceName {
  return value === "camara" || value === "senado";
}

export default async function LawmakerPage({ params }: Readonly<{ params: Promise<{ source: string; externalId: string }> }>) {
  const { source, externalId } = await params;
  if (!validSource(source)) notFound();
  const profile = await getPublicLawmaker(db, source, externalId);
  if (!profile) notFound();
  const { lawmaker } = profile;

  return (
    <main id="conteudo" className="detailPage">
      <nav aria-label="Caminho de navegação" className="breadcrumb"><a href="/">Projetos</a><span>/</span><span aria-current="page">{lawmaker.electoralName}</span></nav>
      <header className="lawmakerHero">
        <div className="lawmakerHero__photo">{lawmaker.photoUrl ? <img alt={`Foto oficial de ${lawmaker.electoralName}`} src={lawmaker.photoUrl} /> : <span aria-hidden="true">{lawmaker.electoralName.slice(0, 1)}</span>}</div>
        <div className="lawmakerHero__body"><SourceBadge source={lawmaker.source} /><span className="eyebrow">{roleLabel(lawmaker.role)} · {lawmaker.active ? "em exercício" : "fora de exercício"}</span><h1>{lawmaker.electoralName}</h1><p>{[lawmaker.party, lawmaker.region].filter(Boolean).join(" · ") || "Partido e UF não informados"}</p><div className="projectHero__actions"><FollowButton kind="lawmaker" source={lawmaker.source} externalId={lawmaker.externalId} label={lawmaker.electoralName} href={`/parlamentares/${lawmaker.source}/${lawmaker.externalId}`} subtitle={[lawmaker.party, lawmaker.region].filter(Boolean).join(" · ")} /><a href={lawmaker.officialUrl} rel="noreferrer" target="_blank">Perfil oficial <ExternalIcon /></a></div></div>
      </header>
      <p className="checkedNote">Dados conferidos em {formatDateTime(lawmaker.checkedAt)}.</p>
      <section className="profileSection"><header className="sectionHeader"><span className="eyebrow">Autoria e coautoria</span><h2>Projetos associados</h2><p>{profile.authoredBills.length} projetos recentes</p></header>{profile.authoredBills.length ? <div className="projectGrid">{profile.authoredBills.map((project) => <ProjectCard key={`${project.source}-${project.externalId}`} project={project} />)}</div> : <p className="sectionEmpty">Nenhum projeto associado foi encontrado na janela de dados atual.</p>}</section>
      <section className="profileSection"><header className="sectionHeader"><span className="eyebrow">Registros nominais públicos</span><h2>Como votou</h2><p>{profile.votes.length} votos recentes</p></header>{profile.votes.length ? <div className="lawmakerVoteGrid">{profile.votes.map((vote) => <LawmakerVoteCard key={vote.voteExternalId} vote={vote} />)}</div> : <p className="sectionEmpty">Nenhum voto nominal público foi encontrado na janela de dados atual.</p>}</section>
    </main>
  );
}
