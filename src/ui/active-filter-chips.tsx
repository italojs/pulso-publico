import type { PublicBillFilters } from "#/server/public/read-models";
import { buildFeedHref } from "#/server/public/search-params";

interface FilterChip {
  ariaLabel: string;
  href: string;
  key: string;
  label: string;
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function daysBefore(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function activityPreset(filters: PublicBillFilters) {
  const today = new Date().toISOString().slice(0, 10);
  if (filters.activityEnd !== today || !filters.activityStart) return undefined;
  if (filters.activityStart === daysBefore(today, 6)) return "7 dias";
  if (filters.activityStart === daysBefore(today, 29)) return "30 dias";
  if (filters.activityStart === daysBefore(today, 364)) return "12 meses";
  return undefined;
}

function withoutArrayValue(
  filters: PublicBillFilters,
  key: keyof PublicBillFilters,
  value: string,
  legacyKey?: keyof PublicBillFilters,
) {
  const current = filters[key];
  const next = Array.isArray(current) ? current.filter((item) => item !== value) : [];
  return buildFeedHref({ ...filters, [key]: next, ...(legacyKey ? { [legacyKey]: undefined } : {}) }, 1);
}

function addArrayChips(
  chips: FilterChip[],
  filters: PublicBillFilters,
  key: keyof PublicBillFilters,
  values: string[] | undefined,
  noun: string,
  label: (value: string) => string = (value) => value,
  legacyKey?: keyof PublicBillFilters,
) {
  for (const value of values ?? []) {
    const readable = label(value);
    chips.push({
      ariaLabel: `Remover ${noun} ${readable}`,
      href: withoutArrayValue(filters, key, value, legacyKey),
      key: `${String(key)}-${value}`,
      label: `${noun[0]?.toUpperCase()}${noun.slice(1)}: ${readable}`,
    });
  }
}

function addScalarChip(
  chips: FilterChip[],
  filters: PublicBillFilters,
  key: keyof PublicBillFilters,
  label: string,
  ariaLabel: string,
  clear: Partial<PublicBillFilters> = { [key]: undefined },
) {
  chips.push({ ariaLabel, href: buildFeedHref({ ...filters, ...clear }, 1), key: String(key), label });
}

const sourceLabels: Record<string, string> = { camara: "Câmara", senado: "Senado" };
const houseLabels: Record<string, string> = {
  camara: "Câmara dos Deputados",
  congresso: "Congresso Nacional",
  nao_informada: "Casa não informada",
  senado: "Senado Federal",
};
const stageLabels: Record<string, string> = {
  closed: "Encerrada",
  committees: "Em comissões",
  presented: "Apresentada",
  ready_for_vote: "Pronta para votação",
  sanction_or_veto: "Sanção ou veto",
  unclassified: "Fase não classificada",
  voted: "Votada",
};
const voteKindLabels: Record<string, string> = { nominal: "Nominal", non_nominal: "Não nominal", secret: "Secreta" };
const voteResultLabels: Record<string, string> = {
  approved: "Aprovada",
  other: "Outro resultado",
  rejected: "Rejeitada",
  unavailable: "Resultado não informado",
};

export function ActiveFilterChips({ filters }: Readonly<{ filters: PublicBillFilters }>) {
  const chips: FilterChip[] = [];
  const proposalTypes = filters.proposalTypes ?? (filters.proposalType ? [filters.proposalType] : undefined);
  const sources = filters.sources ?? (filters.source ? [filters.source] : undefined);
  const statuses = filters.statuses ?? (filters.status ? [filters.status] : undefined);
  const topics = filters.topics ?? (filters.topic ? [filters.topic] : undefined);
  const authors = filters.authors ?? (filters.author ? [filters.author] : undefined);
  const parties = filters.parties ?? (filters.party ? [filters.party] : undefined);

  if (filters.query) addScalarChip(chips, filters, "query", `Busca: ${filters.query}`, `Remover busca ${filters.query}`);
  addArrayChips(chips, filters, "proposalTypes", proposalTypes, "tipo", undefined, "proposalType");
  if (filters.proposalNumber !== undefined) addScalarChip(chips, filters, "proposalNumber", `Número: ${filters.proposalNumber}`, `Remover número ${filters.proposalNumber}`);
  if (filters.yearFrom !== undefined) addScalarChip(chips, filters, "yearFrom", `Ano desde: ${filters.yearFrom}`, `Remover ano desde ${filters.yearFrom}`);
  if (filters.yearTo !== undefined) addScalarChip(chips, filters, "yearTo", `Ano até: ${filters.yearTo}`, `Remover ano até ${filters.yearTo}`);
  addArrayChips(chips, filters, "sources", sources, "casa", (value) => sourceLabels[value] ?? value, "source");
  addArrayChips(chips, filters, "originHouses", filters.originHouses, "origem", (value) => houseLabels[value] ?? value);
  addArrayChips(chips, filters, "currentHouses", filters.currentHouses, "casa atual", (value) => houseLabels[value] ?? value);
  addArrayChips(chips, filters, "stages", filters.stages, "fase", (value) => stageLabels[value] ?? value);
  addArrayChips(chips, filters, "statuses", statuses, "situação", undefined, "status");

  if (filters.presentedStart) {
    const readable = dateLabel(filters.presentedStart);
    addScalarChip(chips, filters, "presentedStart", `Apresentação desde: ${readable}`, `Remover apresentação desde ${readable}`);
  }
  if (filters.presentedEnd) {
    const readable = dateLabel(filters.presentedEnd);
    addScalarChip(chips, filters, "presentedEnd", `Apresentação até: ${readable}`, `Remover apresentação até ${readable}`);
  }

  const preset = activityPreset(filters);
  if (preset) {
    addScalarChip(
      chips,
      filters,
      "activityStart",
      `Atividade nos últimos ${preset}`,
      `Remover atividade nos últimos ${preset}`,
      { activityStart: undefined, activityEnd: undefined },
    );
  } else {
    if (filters.activityStart) {
      const readable = dateLabel(filters.activityStart);
      addScalarChip(chips, filters, "activityStart", `Atividade desde: ${readable}`, `Remover atividade desde ${readable}`);
    }
    if (filters.activityEnd) {
      const readable = dateLabel(filters.activityEnd);
      addScalarChip(chips, filters, "activityEnd", `Atividade até: ${readable}`, `Remover atividade até ${readable}`);
    }
  }

  if (filters.votePresence) {
    const readable = filters.votePresence === "with" ? "Com votação" : "Sem votação";
    addScalarChip(chips, filters, "votePresence", readable, `Remover ${readable.toLocaleLowerCase("pt-BR")}`);
  }
  addArrayChips(chips, filters, "voteKinds", filters.voteKinds, "tipo de votação", (value) => voteKindLabels[value] ?? value);
  if (filters.individualVoteAvailability) {
    const readable = filters.individualVoteAvailability === "available" ? "Com votos individuais" : "Sem votos individuais disponíveis";
    addScalarChip(chips, filters, "individualVoteAvailability", readable, `Remover ${readable.toLocaleLowerCase("pt-BR")}`);
  }
  addArrayChips(chips, filters, "voteResults", filters.voteResults, "resultado", (value) => voteResultLabels[value] ?? value);
  addArrayChips(chips, filters, "voteHouses", filters.voteHouses, "casa da votação", (value) => houseLabels[value] ?? value);
  addArrayChips(chips, filters, "topics", topics, "tema", undefined, "topic");
  addArrayChips(chips, filters, "authors", authors, "autor", undefined, "author");
  addArrayChips(chips, filters, "parties", parties, "partido", undefined, "party");
  addArrayChips(chips, filters, "regions", filters.regions, "UF");
  if (filters.followedOnly) addScalarChip(chips, filters, "followedOnly", "Só acompanhados", "Remover só acompanhados");

  if (chips.length === 0) return null;
  return (
    <nav aria-label="Filtros ativos" className="activeFilters">
      <span className="activeFilters__label">Filtros ativos</span>
      <div className="activeFilters__chips">
        {chips.map((chip) => (
          <a aria-label={chip.ariaLabel} className="filterChip" href={chip.href} key={chip.key}>
            <span>{chip.label}</span><span aria-hidden="true">×</span>
          </a>
        ))}
      </div>
      <a className="activeFilters__clear" href="/">Limpar tudo</a>
    </nav>
  );
}
