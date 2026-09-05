"use client";

import { useState } from "react";

import type { PublicCandidateCard } from "#/server/candidates/read-models";
import { candidateOfficeLabels } from "#/ui/candidate-office";
import { formatDate } from "#/ui/format";
import { ArrowIcon } from "#/ui/icons";

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function formatCandidateCents(value: string | null): string | null {
  if (value === null || !/^-?\d+$/.test(value)) return null;
  const cents = BigInt(value);
  const absolute = cents < 0n ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  return `${cents < 0n ? "-" : ""}R$\u00a0${integer.format(whole)},${fraction.toString().padStart(2, "0")}`;
}

function CandidatePortrait({ candidate }: Readonly<{ candidate: PublicCandidateCard }>) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(candidate.photoUrl) && !failed;
  return (
    <div className="candidateCard__portrait">
      {showPhoto ? (
        <img
          alt={`Foto oficial de ${candidate.ballotName}`}
          onError={() => setFailed(true)}
          src={candidate.photoUrl!}
        />
      ) : (
        <div aria-label={`Sem foto oficial de ${candidate.ballotName}`} className="candidateCard__portraitFallback" role="img">
          <span aria-hidden="true">◇</span>
          <small>Foto não disponibilizada</small>
        </div>
      )}
      <span aria-label={`Número de urna ${candidate.number}`} className="candidateCard__number">{candidate.number}</span>
    </div>
  );
}

function financeLine(label: string, value: string | null) {
  const formatted = formatCandidateCents(value);
  return `${label}: ${formatted ?? "não informado pela fonte"}`;
}

export function CandidateCard({ candidate }: Readonly<{ candidate: PublicCandidateCard }>) {
  const profileHref = `/candidatos/${candidate.electionYear}/${encodeURIComponent(candidate.externalId)}`;
  const assetTotal = formatCandidateCents(candidate.assetTotalCents);
  return (
    <article className="candidateCard">
      <CandidatePortrait candidate={candidate} />
      <div className="candidateCard__body">
        <div className="candidateCard__source">
          <span className="officialLabel">Dados oficiais do TSE</span>
          <time dateTime={candidate.checkedAt}>Conferido em {formatDate(candidate.checkedAt)}</time>
        </div>
        <p className="candidateCard__office">{candidateOfficeLabels[candidate.office]} · {candidate.region}</p>
        <h2><a href={profileHref}>{candidate.ballotName}</a></h2>
        <p className="candidateCard__civilName">{candidate.fullName}</p>
        <p className="candidateCard__party">{candidate.partyAcronym} · {candidate.partyName}</p>
        {candidate.federation ? <p className="candidateCard__federation">{candidate.federation}</p> : null}
        <p className="candidateCard__status"><span aria-hidden="true" />Situação oficial: {candidate.status}</p>

        <dl className="candidateCard__facts">
          <div>
            <dt>Patrimônio</dt>
            <dd>{assetTotal === null
              ? "Patrimônio: não informado pela fonte"
              : `Patrimônio declarado: ${assetTotal} · ${candidate.assetCount.toLocaleString("pt-BR")} ${candidate.assetCount === 1 ? "bem" : "bens"}`}</dd>
          </div>
          <div>
            <dt>Campanha</dt>
            <dd>{candidate.finance ? (
              <><span>{financeLine("Receita", candidate.finance.revenueCents)}</span><span>{financeLine("Despesa", candidate.finance.expenseCents)}</span></>
            ) : "Finanças: ainda não disponibilizadas pelo TSE"}</dd>
          </div>
        </dl>

        <ul aria-label="Disponibilidade de dados oficiais" className="candidateCard__availability">
          <li>{candidate.hasGovernmentPlan ? "Proposta de governo disponível" : "Proposta de governo não disponibilizada"}</li>
          <li>{candidate.hasSocial ? "Redes sociais declaradas" : "Redes sociais não declaradas"}</li>
          <li>{candidate.hasCertificates ? "Certidões disponíveis" : "Certidões não disponibilizadas"}</li>
          <li>{candidate.hasConfirmedLawmaker ? "Histórico parlamentar confirmado" : "Histórico parlamentar não confirmado"}</li>
        </ul>

        <a aria-label={`Ver perfil de ${candidate.ballotName}`} className="candidateCard__action" href={profileHref}>
          Ver perfil <ArrowIcon />
        </a>
      </div>
    </article>
  );
}
