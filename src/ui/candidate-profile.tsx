import type { PublicCandidateDetail } from "#/server/candidates/read-models";
import { CandidateAssets } from "#/ui/candidate-assets";
import { candidateOfficeLabels } from "#/ui/candidate-office";
import { CandidateFinance } from "#/ui/candidate-finance";
import { CandidateHistory } from "#/ui/candidate-history";
import { formatDateTime } from "#/ui/format";
import { CandidatePortrait } from "#/ui/candidate-portrait";

function value(value: string | number | null, fallback = "Não informado pelo TSE") {
  if (value === null || value === "") return fallback;
  return String(value);
}

function ExternalLink({ href, children }: Readonly<{ href: string; children: React.ReactNode }>) {
  return <a className="officialLink" href={href} rel="noreferrer" target="_blank">{children}</a>;
}

function provenanceText(extractedAt: string | null, checkedAt: string) {
  return `TSE · ${extractedAt ? `extração ${formatDateTime(extractedAt)}` : "data de extração não informada"} · conferência ${formatDateTime(checkedAt)}`;
}

export function CandidateProfile({
  candidate,
  followAction,
}: Readonly<{ candidate: PublicCandidateDetail; followAction?: React.ReactNode }>) {
  const basePath = `/candidatos/${candidate.electionYear}/${encodeURIComponent(candidate.externalId)}`;
  const plans = candidate.documents.filter((document) => document.kind === "government_plan");
  const certificates = candidate.documents.filter((document) => document.kind === "certificate");
  return (
    <main id="conteudo" className="candidateProfile">
      <nav aria-label="Caminho de navegação" className="breadcrumb">
        <a href="/candidatos">Candidatos</a><span>/</span><span aria-current="page">{candidate.ballotName}</span>
      </nav>
      <header className="candidateProfileHero">
        <div className="candidateProfileHero__portrait">
          <CandidatePortrait ballotName={candidate.ballotName} photoUrl={candidate.photoUrl} />
          <strong aria-label={`Número de urna ${candidate.number}`}>{candidate.number}</strong>
        </div>
        <div className="candidateProfileHero__body">
          <span className="officialLabel">Dados oficiais do TSE</span>
          <p>{candidateOfficeLabels[candidate.office]} · {candidate.electoralUnit}</p>
          <h1>{candidate.ballotName}</h1>
          <p className="candidateProfileHero__civil">{candidate.fullName}</p>
          <p className="candidateProfileHero__party">{candidate.partyAcronym} · {candidate.partyName}</p>
          {candidate.federation ? <p>{candidate.federation}</p> : null}
          <div className="candidateProfileHero__status"><span aria-hidden="true" />Situação oficial: {candidate.status}{candidate.statusDetail ? ` · ${candidate.statusDetail}` : ""}</div>
          <div className="projectHero__actions">
            {followAction}
            <ExternalLink href={candidate.officialUrl}>Abrir candidatura no TSE</ExternalLink>
          </div>
        </div>
      </header>

      <div className="candidateDossier">
        <section className="candidateDossier__section" aria-labelledby="candidate-declared-title">
          <header className="candidateDossier__sectionHeader"><span className="eyebrow">Perfil informado ao TSE</span><h2 id="candidate-declared-title">Dados declarados</h2></header>
          <dl className="candidateDeclaredGrid">
            <div><dt>Cargo e turno</dt><dd>{candidateOfficeLabels[candidate.office]} · {candidate.round}º turno</dd></div>
            <div><dt>Coligação</dt><dd>{value(candidate.coalition)}</dd></div>
            <div><dt>Busca reeleição</dt><dd>{candidate.seekingReelection === null ? "Não informado pelo TSE" : candidate.seekingReelection ? "Sim" : "Não"}</dd></div>
            <div><dt>Idade na posse</dt><dd>{candidate.ageAtInauguration === null ? "Não informada pelo TSE" : `${candidate.ageAtInauguration} anos`}</dd></div>
            <div><dt>Escolaridade</dt><dd>{value(candidate.education)}</dd></div>
            <div><dt>Ocupação</dt><dd>{value(candidate.occupation)}</dd></div>
            <div><dt>Gênero</dt><dd>{value(candidate.gender)}</dd></div>
            <div><dt>Raça ou cor</dt><dd>{value(candidate.race)}</dd></div>
            <div><dt>Estado civil</dt><dd>{value(candidate.maritalStatus)}</dd></div>
            <div><dt>Nacionalidade</dt><dd>{value(candidate.nationality)}</dd></div>
            <div><dt>Naturalidade</dt><dd>{[candidate.birthCity, candidate.birthRegion].filter(Boolean).join(" · ") || "Não informada pelo TSE"}</dd></div>
          </dl>
        </section>

        <section className="candidateDossier__section" aria-labelledby="candidate-plan-title">
          <header className="candidateDossier__sectionHeader"><span className="eyebrow">Documento sem interpretação</span><h2 id="candidate-plan-title">Proposta de governo</h2></header>
          {plans.length ? <ul className="candidateDocumentList">{plans.map((plan) => <li key={plan.officialUrl}>
            <strong>{plan.label}</strong>
            <div><ExternalLink href={plan.officialUrl}>Abrir proposta no TSE</ExternalLink>{plan.downloadUrl ? <a className="officialLink" href={plan.downloadUrl}>Baixar cópia oficial da proposta</a> : null}</div>
          </li>)}</ul> : <p className="sectionEmpty">Ainda não disponibilizada pelo TSE.</p>}
        </section>

        <CandidateAssets assets={candidate.assets} categories={candidate.assetCategories} totalCents={candidate.assetTotalCents} />
        <CandidateFinance finance={candidate.finance} />

        <section className="candidateDossier__section" aria-labelledby="candidate-documents-title">
          <header className="candidateDossier__sectionHeader"><span className="eyebrow">Sem resumo ou interpretação jurídica</span><h2 id="candidate-documents-title">Documentos e presença oficial</h2></header>
          <div className="candidateDocumentsGrid">
            <section aria-labelledby="candidate-certificates-title"><h3 id="candidate-certificates-title">Certidões</h3>
              {certificates.length ? <ul className="candidateDocumentList">{certificates.map((document) => <li key={document.officialUrl}>
                <strong>{document.label}</strong><div><ExternalLink href={document.officialUrl}>Abrir certidão no TSE</ExternalLink>{document.downloadUrl ? <a className="officialLink" href={document.downloadUrl}>Baixar cópia oficial da certidão</a> : null}</div>
              </li>)}</ul> : <p className="sectionEmpty">Documento ainda não disponibilizado pelo TSE.</p>}
            </section>
            <section aria-labelledby="candidate-social-title"><h3 id="candidate-social-title">Redes declaradas</h3>
              {candidate.socialLinks.length ? <ul className="candidateSocialList">{candidate.socialLinks.map((link) => <li key={link.url}><ExternalLink href={link.url}>{link.label}</ExternalLink></li>)}</ul> : <p className="sectionEmpty">Presença oficial ainda não disponibilizada pelo TSE.</p>}
            </section>
          </div>
        </section>

        <CandidateHistory basePath={basePath} history={candidate.history} />

        <section className="candidateDossier__section candidateProvenance" aria-labelledby="candidate-provenance-title">
          <header className="candidateDossier__sectionHeader"><span className="eyebrow">Origem e conferência</span><h2 id="candidate-provenance-title">Proveniência dos dados</h2></header>
          <dl>
            <div><dt>Candidatura</dt><dd>{provenanceText(candidate.sourceExtractedAt, candidate.checkedAt)}</dd></div>
            <div><dt>Foto oficial</dt><dd>{candidate.photoSource ? provenanceText(candidate.photoSource.sourceExtractedAt, candidate.photoSource.checkedAt) : "Fonte ainda não disponibilizada pelo TSE"}</dd></div>
            <div><dt>Patrimônio</dt><dd>{candidate.assets[0] ? provenanceText(candidate.assets[0].sourceExtractedAt, candidate.assets[0].checkedAt) : "Fonte ainda não disponibilizada pelo TSE"}</dd></div>
            <div><dt>Campanha</dt><dd>{candidate.finance ? provenanceText(candidate.finance.sourceExtractedAt, candidate.finance.checkedAt) : "Fonte ainda não disponibilizada pelo TSE"}</dd></div>
            <div><dt>Redes sociais</dt><dd>{candidate.socialLinks[0] ? provenanceText(candidate.socialLinks[0].sourceExtractedAt, candidate.socialLinks[0].checkedAt) : "Fonte ainda não disponibilizada pelo TSE"}</dd></div>
            <div><dt>Planos e certidões</dt><dd>{candidate.documents[0] ? provenanceText(candidate.documents[0].sourceExtractedAt, candidate.documents[0].checkedAt) : "Fonte ainda não disponibilizada pelo TSE"}</dd></div>
          </dl>
          <p>O histórico parlamentar usa somente vínculos confirmados e registros oficiais da Câmara dos Deputados ou do Senado Federal.</p>
        </section>
      </div>
    </main>
  );
}
