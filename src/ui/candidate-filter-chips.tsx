"use client";

import type { CandidateOffice } from "#/domain/electoral";
import type { CandidateFilters } from "#/server/candidates/read-models";
import {
  buildCandidateCatalogSelectionHref,
  buildCandidateHref,
  type CandidateComparisonSelection,
} from "#/server/candidates/search-params";
import { formatCandidateCents } from "#/ui/candidate-card";
import { candidateOfficeLabels } from "#/ui/candidate-office";

interface CandidateFilterChip {
  ariaLabel: string;
  href: string;
  key: string;
  label: string;
}

function withoutArrayValue<T extends keyof CandidateFilters>(
  filters: CandidateFilters,
  key: T,
  value: string | number,
) {
  const current = filters[key];
  const next = Array.isArray(current) ? current.filter((item) => item !== value) : undefined;
  const removedLastRegion = key === "regions" && !next?.length;
  return buildCandidateHref({
    ...filters,
    [key]: next?.length ? next : undefined,
    allBrazil: removedLastRegion ? true : filters.allBrazil,
    page: undefined,
  }, 1);
}

function addArrayChips(
  chips: CandidateFilterChip[],
  filters: CandidateFilters,
  key: keyof CandidateFilters,
  values: readonly (string | number)[] | undefined,
  noun: string,
  label: (value: string | number) => string = String,
) {
  for (const value of values ?? []) {
    const readable = label(value);
    chips.push({
      ariaLabel: `Remover ${noun} ${readable}`,
      href: withoutArrayValue(filters, key, value),
      key: `${String(key)}-${value}`,
      label: `${noun[0]?.toLocaleUpperCase("pt-BR")}${noun.slice(1)}: ${readable}`,
    });
  }
}

function addScalarChip(
  chips: CandidateFilterChip[],
  filters: CandidateFilters,
  key: keyof CandidateFilters,
  label: string,
  ariaLabel = `Remover ${label.toLocaleLowerCase("pt-BR")}`,
) {
  chips.push({
    ariaLabel,
    href: buildCandidateHref({ ...filters, [key]: undefined, page: undefined }, 1),
    key: String(key),
    label,
  });
}

const fundingLabels = { public: "Recursos públicos", private: "Recursos privados", own: "Recursos próprios" } as const;
const houseLabels = { camara: "Câmara dos Deputados", senado: "Senado Federal" } as const;

function moneyRangeLabel(prefix: string, value: bigint) {
  return `${prefix}: ${formatCandidateCents(value.toString())}`;
}

function addBooleanChip(
  chips: CandidateFilterChip[],
  filters: CandidateFilters,
  key: keyof CandidateFilters,
  value: boolean | undefined,
  yes: string,
  no: string,
) {
  if (value !== undefined) addScalarChip(chips, filters, key, value ? yes : no);
}

export function CandidateFilterChips({ comparison, filters }: Readonly<{
  comparison?: CandidateComparisonSelection;
  filters: CandidateFilters;
}>) {
  const chips: CandidateFilterChip[] = [];
  if (filters.query) addScalarChip(chips, filters, "query", `Busca: ${filters.query}`, `Remover busca ${filters.query}`);
  addArrayChips(chips, filters, "electionYears", filters.electionYears, "ano");
  addArrayChips(chips, filters, "offices", filters.offices, "cargo", (value) => candidateOfficeLabels[value as CandidateOffice]);
  addArrayChips(chips, filters, "regions", filters.regions, "UF");
  addArrayChips(chips, filters, "parties", filters.parties, "partido");
  addArrayChips(chips, filters, "rounds", filters.rounds, "turno", (value) => `${value}º`);
  addArrayChips(chips, filters, "statuses", filters.statuses, "situação");
  addArrayChips(chips, filters, "federations", filters.federations, "federação");
  addArrayChips(chips, filters, "coalitions", filters.coalitions, "coligação");
  if (filters.ageMin !== undefined) addScalarChip(chips, filters, "ageMin", `Idade mínima: ${filters.ageMin}`);
  if (filters.ageMax !== undefined) addScalarChip(chips, filters, "ageMax", `Idade máxima: ${filters.ageMax}`);
  addArrayChips(chips, filters, "genders", filters.genders, "gênero");
  addArrayChips(chips, filters, "races", filters.races, "raça ou cor");
  addArrayChips(chips, filters, "educations", filters.educations, "escolaridade");
  addArrayChips(chips, filters, "occupations", filters.occupations, "ocupação");
  if (filters.declaredAssets) addScalarChip(chips, filters, "declaredAssets", filters.declaredAssets === "yes" ? "Declarou bens" : "Sem bens declarados");
  if (filters.assetMinCents !== undefined) addScalarChip(chips, filters, "assetMinCents", moneyRangeLabel("Patrimônio mínimo", filters.assetMinCents));
  if (filters.assetMaxCents !== undefined) addScalarChip(chips, filters, "assetMaxCents", moneyRangeLabel("Patrimônio máximo", filters.assetMaxCents));
  if (filters.assetCountMin !== undefined) addScalarChip(chips, filters, "assetCountMin", `Quantidade mínima de bens: ${filters.assetCountMin}`);
  if (filters.assetCountMax !== undefined) addScalarChip(chips, filters, "assetCountMax", `Quantidade máxima de bens: ${filters.assetCountMax}`);
  addArrayChips(chips, filters, "assetCategories", filters.assetCategories, "categoria de bem");
  if (filters.revenueMinCents !== undefined) addScalarChip(chips, filters, "revenueMinCents", moneyRangeLabel("Receita mínima", filters.revenueMinCents));
  if (filters.revenueMaxCents !== undefined) addScalarChip(chips, filters, "revenueMaxCents", moneyRangeLabel("Receita máxima", filters.revenueMaxCents));
  if (filters.expenseMinCents !== undefined) addScalarChip(chips, filters, "expenseMinCents", moneyRangeLabel("Despesa mínima", filters.expenseMinCents));
  if (filters.expenseMaxCents !== undefined) addScalarChip(chips, filters, "expenseMaxCents", moneyRangeLabel("Despesa máxima", filters.expenseMaxCents));
  if (filters.balanceMinCents !== undefined) addScalarChip(chips, filters, "balanceMinCents", moneyRangeLabel("Saldo mínimo", filters.balanceMinCents));
  if (filters.balanceMaxCents !== undefined) addScalarChip(chips, filters, "balanceMaxCents", moneyRangeLabel("Saldo máximo", filters.balanceMaxCents));
  addArrayChips(chips, filters, "fundingKinds", filters.fundingKinds, "origem do recurso", (value) => fundingLabels[value as keyof typeof fundingLabels]);
  addBooleanChip(chips, filters, "hasPhoto", filters.hasPhoto, "Com foto", "Sem foto");
  addBooleanChip(chips, filters, "hasSocial", filters.hasSocial, "Com redes sociais", "Sem redes sociais");
  addBooleanChip(chips, filters, "hasGovernmentPlan", filters.hasGovernmentPlan, "Com proposta de governo", "Sem proposta de governo");
  addBooleanChip(chips, filters, "hasCertificates", filters.hasCertificates, "Com certidões", "Sem certidões");
  addBooleanChip(chips, filters, "hasFinance", filters.hasFinance, "Com dados financeiros", "Sem dados financeiros");
  addBooleanChip(chips, filters, "hasConfirmedLawmaker", filters.hasConfirmedLawmaker, "Com histórico parlamentar confirmado", "Sem histórico parlamentar confirmado");
  addArrayChips(chips, filters, "lawmakerHouses", filters.lawmakerHouses, "casa", (value) => houseLabels[value as keyof typeof houseLabels]);
  addBooleanChip(chips, filters, "activeMandate", filters.activeMandate, "Mandato em exercício", "Mandato anterior");
  addArrayChips(chips, filters, "topics", filters.topics, "tema");
  if (filters.followedOnly) addScalarChip(chips, filters, "followedOnly", "Somente candidatos seguidos");
  if (comparison) {
    for (const chip of chips) chip.href = buildCandidateCatalogSelectionHref(chip.href, comparison);
  }

  if (!chips.length) return null;
  const clearHref = buildCandidateCatalogSelectionHref(
    filters.allBrazil ? "/candidatos?abrangencia=brasil" : "/candidatos",
    comparison,
  );
  return (
    <nav aria-label="Filtros ativos de candidatos" className="activeFilters candidateActiveFilters">
      <span className="activeFilters__label">Filtros ativos</span>
      <div className="activeFilters__chips">
        {chips.map((chip) => (
          <a aria-label={chip.ariaLabel} className="filterChip" href={chip.href} key={chip.key}>
            <span>{chip.label}</span><span aria-hidden="true">×</span>
          </a>
        ))}
      </div>
      <a aria-label="Limpar todos os filtros" className="activeFilters__clear" href={clearHref}>Limpar tudo</a>
    </nav>
  );
}
