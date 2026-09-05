"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation.js";

import type {
  PublicCandidateCard,
  PublicCandidateComparisonChoice,
} from "#/server/candidates/read-models";
import {
  buildCandidateCatalogSelectionHref,
  buildCandidateComparisonHref,
} from "#/server/candidates/search-params";
import { CandidateCard } from "#/ui/candidate-card";

function compatible(left: PublicCandidateComparisonChoice, right: PublicCandidateCard): boolean {
  return left.electionYear === right.electionYear
    && left.office === right.office
    && left.electoralUnit === right.electoralUnit;
}

function choice(candidate: PublicCandidateCard): PublicCandidateComparisonChoice {
  return {
    electionYear: candidate.electionYear,
    externalId: candidate.externalId,
    ballotName: candidate.ballotName,
    office: candidate.office,
    electoralUnit: candidate.electoralUnit,
  };
}

const emptyInitialCandidates: PublicCandidateComparisonChoice[] = [];

export function CandidateComparePicker({ candidates, catalogHref, initialCandidates = emptyInitialCandidates }: Readonly<{
  candidates: PublicCandidateCard[];
  catalogHref?: string;
  initialCandidates?: PublicCandidateComparisonChoice[];
}>) {
  const router = useRouter();
  const [selectedCandidates, setSelectedCandidates] = useState<PublicCandidateComparisonChoice[]>(initialCandidates);
  useEffect(() => { setSelectedCandidates(initialCandidates); }, [initialCandidates]);
  const selectedIds = selectedCandidates.map((candidate) => candidate.externalId);
  const first = selectedCandidates[0];

  function updateSelection(next: PublicCandidateComparisonChoice[]) {
    setSelectedCandidates(next);
    if (catalogHref) {
      router.replace(buildCandidateCatalogSelectionHref(
        catalogHref,
        next.length ? { year: next[0]!.electionYear, ids: next.map((item) => item.externalId) } : undefined,
      ));
    }
  }

  function toggle(candidate: PublicCandidateCard) {
    updateSelection(selectedIds.includes(candidate.externalId)
      ? selectedCandidates.filter((item) => item.externalId !== candidate.externalId)
      : [...selectedCandidates, choice(candidate)]);
  }

  return (
    <>
      <section aria-label="Seleção para comparação" className="candidateCompareTray">
        <div>
          <span className="eyebrow">Comparação factual</span>
          <h3>Compare até três candidaturas</h3>
          <p>Depois da primeira escolha, selecione somente candidaturas do mesmo cargo e da mesma circunscrição.</p>
        </div>
        {selectedCandidates.length ? (
          <ul>
            {selectedCandidates.map((candidate) => (
              <li key={candidate.externalId}>
                <span>{candidate.ballotName}</span>
                <button
                  aria-label={`Remover ${candidate.ballotName} da comparação`}
                  onClick={() => {
                    const current = candidates.find((item) => item.externalId === candidate.externalId);
                    if (current) toggle(current);
                    else updateSelection(selectedCandidates.filter((item) => item.externalId !== candidate.externalId));
                  }}
                  type="button"
                >×</button>
              </li>
            ))}
          </ul>
        ) : <p className="candidateCompareTray__empty">Nenhuma candidatura selecionada</p>}
        {selectedCandidates.length >= 2 ? (
          <a
            className="candidateCompareTray__action"
            href={buildCandidateComparisonHref(selectedCandidates[0]!.electionYear, selectedIds)}
          >Comparar {selectedCandidates.length} candidaturas</a>
        ) : <span className="candidateCompareTray__hint">Selecione pelo menos duas para colocar lado a lado.</span>}
      </section>

      <div className="candidateGrid">
        {candidates.map((candidate) => {
          const selected = selectedIds.includes(candidate.externalId);
          const disabledReason = selected
            ? undefined
            : selectedIds.length >= 3
              ? "Limite de três candidaturas atingido. Remova uma seleção para incluir esta candidatura."
              : first && !compatible(first, candidate)
                ? "Para comparar, as candidaturas precisam disputar o mesmo cargo e circunscrição."
                : undefined;
          return (
            <CandidateCard
              candidate={candidate}
              comparison={{ selected, onToggle: () => toggle(candidate), disabledReason }}
              key={`${candidate.electionYear}-${candidate.externalId}`}
            />
          );
        })}
      </div>
    </>
  );
}
