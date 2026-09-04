"use client";

import { useEffect, useId, useRef, useState } from "react";

import type {
  PublicBillFilters,
  PublicFilterOption,
  PublicFilterOptions,
} from "#/server/public/read-models";
import { countActiveFilters } from "#/server/public/search-params";

type AnonymousBillKey = { externalId: string; source: "camara" | "senado" };
type PreviewState = "idle" | "loading" | "ready" | "error";

const EMPTY_BILL_KEYS: AnonymousBillKey[] = [];
const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function canonicalFilters(filters: PublicBillFilters): PublicBillFilters {
  const {
    author,
    page: _page,
    pageSize: _pageSize,
    party,
    proposalType,
    source,
    status,
    topic,
    ...canonical
  } = filters;
  return compactFilters({
    ...canonical,
    authors: canonical.authors ?? (author ? [author] : undefined),
    order: canonical.order === "presented" ? "presented_desc" : canonical.order,
    parties: canonical.parties ?? (party ? [party] : undefined),
    proposalTypes: canonical.proposalTypes ?? (proposalType ? [proposalType] : undefined),
    sources: canonical.sources ?? (source ? [source] : undefined),
    statuses: canonical.statuses ?? (status ? [status] : undefined),
    topics: canonical.topics ?? (topic ? [topic] : undefined),
  });
}

function compactFilters(filters: PublicBillFilters): PublicBillFilters {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => {
    if (value === undefined || value === "" || value === false) return false;
    return !Array.isArray(value) || value.length > 0;
  })) as PublicBillFilters;
}

function currentQuickFilters(draft: PublicBillFilters, form: HTMLFormElement | null): PublicBillFilters {
  if (!form) return compactFilters(draft);
  const data = new FormData(form);
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : undefined;
  };
  const values = (name: string) => [...new Set(data.getAll(name).flatMap((value) => {
    if (typeof value !== "string" || !value.trim()) return [];
    return value.trim().slice(0, 200);
  }))];
  const sources = values("fonte") as PublicBillFilters["sources"];
  const statuses = values("situacao");
  const topics = values("tema");
  return compactFilters({
    ...draft,
    query: text("q"),
    sources: sources?.length ? sources : undefined,
    statuses: statuses.length ? statuses : undefined,
    topics: topics.length ? topics : undefined,
  });
}

function hidden(name: string, values: readonly (string | number)[] | undefined) {
  return values?.map((value) => <input key={`${name}-${value}`} name={name} type="hidden" value={value} />);
}

function HiddenAdvancedFilters({ filters }: Readonly<{ filters: PublicBillFilters }>) {
  return (
    <>
      {hidden("tipo", filters.proposalTypes)}
      {filters.proposalNumber !== undefined && <input name="numero" type="hidden" value={filters.proposalNumber} />}
      {filters.yearFrom !== undefined && <input name="anoInicio" type="hidden" value={filters.yearFrom} />}
      {filters.yearTo !== undefined && <input name="anoFim" type="hidden" value={filters.yearTo} />}
      {hidden("origem", filters.originHouses)}
      {hidden("casaAtual", filters.currentHouses)}
      {hidden("fase", filters.stages)}
      {filters.presentedStart && <input name="apresentadaInicio" type="hidden" value={filters.presentedStart} />}
      {filters.presentedEnd && <input name="apresentadaFim" type="hidden" value={filters.presentedEnd} />}
      {filters.activityStart && <input name="atividadeInicio" type="hidden" value={filters.activityStart} />}
      {filters.activityEnd && <input name="atividadeFim" type="hidden" value={filters.activityEnd} />}
      {filters.votePresence && <input name="votacao" type="hidden" value={filters.votePresence} />}
      {hidden("tipoVotacao", filters.voteKinds)}
      {filters.individualVoteAvailability && <input name="votosIndividuais" type="hidden" value={filters.individualVoteAvailability} />}
      {hidden("resultado", filters.voteResults)}
      {hidden("casaVotacao", filters.voteHouses)}
      {hidden("autor", filters.authors)}
      {hidden("partido", filters.parties)}
      {hidden("uf", filters.regions)}
      {filters.followedOnly && <input name="acompanhando" type="hidden" value="1" />}
      {filters.order && <input name="ordem" type="hidden" value={filters.order} />}
    </>
  );
}

function ChoiceList({
  label,
  onChange,
  options,
  selected,
}: Readonly<{
  label: string;
  onChange: (values: string[]) => void;
  options: readonly (string | PublicFilterOption)[];
  selected: readonly string[] | undefined;
}>) {
  const values = selected ?? [];
  return (
    <div className="advancedFilters__choiceGroup">
      <span className="advancedFilters__subheading">{label}</span>
      <div className="advancedFilters__choices">
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return (
            <label key={value}>
              <input
                checked={values.includes(value)}
                onChange={(event) => onChange(event.currentTarget.checked
                  ? [...values, value]
                  : values.filter((item) => item !== value))}
                type="checkbox"
              />
              <span>{optionLabel}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function RadioList({
  label,
  onChange,
  options,
  selected,
}: Readonly<{
  label: string;
  onChange: (value: string | undefined) => void;
  options: readonly PublicFilterOption[];
  selected: string | undefined;
}>) {
  return (
    <div className="advancedFilters__choiceGroup">
      <span className="advancedFilters__subheading">{label}</span>
      <div className="advancedFilters__choices">
        {options.map((option) => (
          <label key={option.value}>
            <input
              checked={selected === option.value}
              onChange={() => onChange(selected === option.value ? undefined : option.value)}
              type="radio"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function presetDates(days: number) {
  const end = isoToday();
  const start = new Date(`${end}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { activityEnd: end, activityStart: start.toISOString().slice(0, 10) };
}

function activityPresetValue(filters: PublicBillFilters) {
  for (const days of [7, 30, 365]) {
    const preset = presetDates(days);
    if (preset.activityStart === filters.activityStart && preset.activityEnd === filters.activityEnd) return String(days);
  }
  return filters.activityStart || filters.activityEnd ? "custom" : "";
}

interface AdvancedFiltersProps {
  anonymousBillKeys?: AnonymousBillKey[];
  filters: PublicBillFilters;
  options: PublicFilterOptions;
}

export function AdvancedFilters({
  anonymousBillKeys = EMPTY_BILL_KEYS,
  filters,
  options,
}: Readonly<AdvancedFiltersProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(() => canonicalFilters(filters));
  const [lastValidCount, setLastValidCount] = useState<number>();
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const dialogId = useId();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const update = <K extends keyof PublicBillFilters>(key: K, value: PublicBillFilters[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const closeDialog = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setPreviewState("loading");
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/projects/filter-count", {
          body: JSON.stringify({ filters: currentQuickFilters(draft, triggerRef.current?.form ?? null), anonymousBillKeys }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Count request failed");
        const payload = await response.json() as { total?: unknown };
        if (!Number.isSafeInteger(payload.total) || Number(payload.total) < 0) throw new Error("Invalid count response");
        if (controller.signal.aborted) return;
        setLastValidCount(Number(payload.total));
        setPreviewState("ready");
      } catch (error) {
        if (!controller.signal.aborted && (!(error instanceof Error) || error.name !== "AbortError")) setPreviewState("error");
      }
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [anonymousBillKeys, draft, isOpen]);

  const clearAdvanced = () => {
    setDraft((current) => compactFilters({
      query: current.query,
      sources: current.sources,
      statuses: current.statuses,
      topics: current.topics,
    }));
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector)];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const activeCount = countActiveFilters(filters);
  const countMessage = previewState === "error"
    ? "Não foi possível atualizar a contagem"
    : previewState === "ready" && lastValidCount !== undefined
      ? `${lastValidCount.toLocaleString("pt-BR")} ${lastValidCount === 1 ? "projeto encontrado" : "projetos encontrados"}`
      : "Atualizando contagem…";

  return (
    <>
      <HiddenAdvancedFilters filters={draft} />
      <button
        aria-controls={dialogId}
        aria-expanded={isOpen}
        className="advancedFiltersTrigger"
        onClick={() => setIsOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <span>Filtros avançados</span>
        {activeCount > 0 && <strong aria-label={`${activeCount} ${activeCount === 1 ? "ativo" : "ativos"}`}>{activeCount}</strong>}
      </button>
      {isOpen && (
        <>
          <div aria-hidden="true" className="advancedFiltersBackdrop" onMouseDown={closeDialog} />
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className="advancedFilters"
            id={dialogId}
            onKeyDown={handleDialogKeyDown}
            role="dialog"
          >
            <header className="advancedFilters__header">
              <div><span className="eyebrow">Refine sua busca</span><h2 id={titleId}>Filtros avançados</h2></div>
              <button aria-label="Fechar filtros avançados" onClick={closeDialog} ref={closeRef} type="button">×</button>
            </header>
            <div className="advancedFilters__body">
              <p className="advancedFilters__intro">Combine informações oficiais para chegar aos projetos que você procura.</p>
              <fieldset>
                <legend>Identificação</legend>
                <ChoiceList label="Tipo de projeto" onChange={(value) => update("proposalTypes", value)} options={options.proposalTypes} selected={draft.proposalTypes} />
                <div className="advancedFilters__fields">
                  <label>Número do projeto<input min="1" onChange={(event) => update("proposalNumber", event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} type="number" value={draft.proposalNumber ?? ""} /></label>
                  <label>Ano inicial<select onChange={(event) => update("yearFrom", event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} value={draft.yearFrom ?? ""}><option value="">Qualquer ano</option>{options.years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
                  <label>Ano final<select onChange={(event) => update("yearTo", event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} value={draft.yearTo ?? ""}><option value="">Qualquer ano</option>{options.years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Tramitação</legend>
                <ChoiceList label="Casa de origem" onChange={(value) => update("originHouses", value as PublicBillFilters["originHouses"])} options={options.originHouses} selected={draft.originHouses} />
                <ChoiceList label="Casa atual" onChange={(value) => update("currentHouses", value as PublicBillFilters["currentHouses"])} options={options.currentHouses} selected={draft.currentHouses} />
                <ChoiceList label="Fase geral" onChange={(value) => update("stages", value as PublicBillFilters["stages"])} options={options.stages} selected={draft.stages} />
                <div className="advancedFilters__fields advancedFilters__fields--dates">
                  <label>Apresentada desde<input onChange={(event) => update("presentedStart", event.currentTarget.value || undefined)} type="date" value={draft.presentedStart ?? ""} /></label>
                  <label>Apresentada até<input onChange={(event) => update("presentedEnd", event.currentTarget.value || undefined)} type="date" value={draft.presentedEnd ?? ""} /></label>
                  <label>Atividade recente<select
                    aria-label="Período de atividade"
                    onChange={(event) => {
                      const days = Number(event.currentTarget.value);
                      if (days > 0) setDraft((current) => ({ ...current, ...presetDates(days) }));
                      else if (!event.currentTarget.value) setDraft((current) => ({ ...current, activityStart: undefined, activityEnd: undefined }));
                    }}
                    value={activityPresetValue(draft)}
                  ><option value="">Qualquer período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="365">Últimos 12 meses</option>{activityPresetValue(draft) === "custom" && <option value="custom">Período personalizado</option>}</select></label>
                  <label>Atividade desde<input onChange={(event) => update("activityStart", event.currentTarget.value || undefined)} type="date" value={draft.activityStart ?? ""} /></label>
                  <label>Atividade até<input onChange={(event) => update("activityEnd", event.currentTarget.value || undefined)} type="date" value={draft.activityEnd ?? ""} /></label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Votações</legend>
                <RadioList label="Há votação registrada?" onChange={(value) => update("votePresence", value as PublicBillFilters["votePresence"])} options={[{ value: "with", label: "Com votação" }, { value: "without", label: "Sem votação" }]} selected={draft.votePresence} />
                <ChoiceList label="Tipo de votação" onChange={(value) => update("voteKinds", value as PublicBillFilters["voteKinds"])} options={options.voteKinds} selected={draft.voteKinds} />
                <RadioList label="Votos individuais" onChange={(value) => update("individualVoteAvailability", value as PublicBillFilters["individualVoteAvailability"])} options={[{ value: "available", label: "Disponíveis" }, { value: "unavailable", label: "Não disponíveis" }]} selected={draft.individualVoteAvailability} />
                <ChoiceList label="Resultado" onChange={(value) => update("voteResults", value as PublicBillFilters["voteResults"])} options={options.voteResults} selected={draft.voteResults} />
                <ChoiceList label="Casa da votação" onChange={(value) => update("voteHouses", value as PublicBillFilters["voteHouses"])} options={options.voteHouses} selected={draft.voteHouses} />
              </fieldset>

              <fieldset>
                <legend>Autoria e representação</legend>
                <ChoiceList label="Autoria" onChange={(value) => update("authors", value)} options={options.authors} selected={draft.authors} />
                <ChoiceList label="Partido" onChange={(value) => update("parties", value)} options={options.parties} selected={draft.parties} />
                <ChoiceList label="Estado ou região" onChange={(value) => update("regions", value)} options={options.regions} selected={draft.regions} />
                <label className="advancedFilters__standaloneChoice"><input checked={draft.followedOnly ?? false} onChange={(event) => update("followedOnly", event.currentTarget.checked || undefined)} type="checkbox" /><span>Mostrar somente projetos que acompanho</span></label>
              </fieldset>

              <fieldset>
                <legend>Ordem dos resultados</legend>
                <label className="advancedFilters__selectLabel">Ordenar por<select onChange={(event) => update("order", event.currentTarget.value as PublicBillFilters["order"])} value={draft.order ?? "updated"}><option value="updated">Atividade mais recente</option><option value="presented_desc">Apresentação mais recente</option><option value="presented_asc">Apresentação mais antiga</option><option value="most_movements">Mais movimentações</option><option value="most_votes">Mais votações</option></select></label>
              </fieldset>
            </div>
            <footer className="advancedFilters__footer">
              <p aria-live="polite" role="status">{countMessage}</p>
              <div><button className="advancedFilters__clear" onClick={clearAdvanced} type="button">Limpar seleção</button><button className="advancedFilters__apply" type="submit">{lastValidCount === undefined ? "Aplicar filtros" : `Ver ${lastValidCount.toLocaleString("pt-BR")} ${lastValidCount === 1 ? "projeto" : "projetos"}`}</button></div>
            </footer>
          </section>
        </>
      )}
    </>
  );
}
