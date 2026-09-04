"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PublicBillFilters, PublicFilterOption, PublicFilterOptions, PublicRecentActivity } from "#/server/public/read-models";
import { countActiveFilters } from "#/server/public/search-params";

type AnonymousBillKey = { externalId: string; source: "camara" | "senado" };
type PreviewState = "idle" | "loading" | "ready" | "error";
type ActivityMode = "" | PublicRecentActivity | "custom";
const EMPTY_BILL_KEYS: AnonymousBillKey[] = [];
const MAX_SELECTED_VALUES = 20;
const focusableSelector = "button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
const sourceOptions: PublicFilterOption[] = [
  { value: "camara", label: "Câmara dos Deputados" },
  { value: "senado", label: "Senado Federal" },
];

function compactFilters(filters: PublicBillFilters): PublicBillFilters {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => {
    if (value === undefined || value === "" || value === false) return false;
    return !Array.isArray(value) || value.length > 0;
  })) as PublicBillFilters;
}

function capped(values: readonly string[] | undefined) {
  return [...new Set(values?.map((value) => value.trim()).filter(Boolean))].slice(0, MAX_SELECTED_VALUES);
}

function canonicalFilters(filters: PublicBillFilters): PublicBillFilters {
  const { author, page: _page, pageSize: _pageSize, party, proposalType, source, status, topic, ...canonical } = filters;
  const result = compactFilters({
    ...canonical,
    authors: capped(canonical.authors ?? (author ? [author] : undefined)),
    currentHouses: capped(canonical.currentHouses) as PublicBillFilters["currentHouses"],
    originHouses: capped(canonical.originHouses) as PublicBillFilters["originHouses"],
    order: canonical.order === "presented" ? "presented_desc" : canonical.order,
    parties: capped(canonical.parties ?? (party ? [party] : undefined)),
    proposalTypes: capped(canonical.proposalTypes ?? (proposalType ? [proposalType] : undefined)),
    regions: capped(canonical.regions),
    sources: capped(canonical.sources ?? (source ? [source] : undefined)) as PublicBillFilters["sources"],
    stages: capped(canonical.stages) as PublicBillFilters["stages"],
    statuses: capped(canonical.statuses ?? (status ? [status] : undefined)),
    topics: capped(canonical.topics ?? (topic ? [topic] : undefined)),
    voteHouses: capped(canonical.voteHouses) as PublicBillFilters["voteHouses"],
    voteKinds: capped(canonical.voteKinds) as PublicBillFilters["voteKinds"],
    voteResults: capped(canonical.voteResults) as PublicBillFilters["voteResults"],
  });
  if (result.recentActivity) {
    result.activityStart = undefined;
    result.activityEnd = undefined;
  }
  return compactFilters(result);
}

function validIsoDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 0) - 1 && date.getUTCDate() === day ? value : undefined;
}

function strictPreviewFilters(filters: PublicBillFilters): PublicBillFilters {
  const canonical = canonicalFilters(filters);
  const allowed = <T extends string>(values: readonly string[] | undefined, accepted: readonly T[]) =>
    capped(values).filter((value): value is T => accepted.includes(value as T));
  const texts = (values: readonly string[] | undefined) => capped(values).map((value) => value.slice(0, 200));
  const positive = (value: number | undefined) => Number.isSafeInteger(value) && Number(value) > 0 ? value : undefined;
  const recentActivity = ["24h", "7d", "30d"].includes(canonical.recentActivity ?? "") ? canonical.recentActivity : undefined;
  return compactFilters({
    query: canonical.query?.trim().slice(0, 200),
    proposalTypes: capped(canonical.proposalTypes).map((value) => value.toUpperCase()).filter((value) => /^[A-Z]{2,10}$/.test(value)),
    proposalNumber: positive(canonical.proposalNumber), yearFrom: positive(canonical.yearFrom), yearTo: positive(canonical.yearTo),
    sources: allowed(canonical.sources, ["camara", "senado"]),
    originHouses: allowed(canonical.originHouses, ["camara", "senado", "congresso"]),
    currentHouses: allowed(canonical.currentHouses, ["camara", "senado", "congresso", "nao_informada"]),
    stages: allowed(canonical.stages, ["presented", "committees", "ready_for_vote", "voted", "sanction_or_veto", "closed", "unclassified"]),
    statuses: texts(canonical.statuses), presentedStart: validIsoDate(canonical.presentedStart), presentedEnd: validIsoDate(canonical.presentedEnd),
    recentActivity, activityStart: recentActivity ? undefined : validIsoDate(canonical.activityStart), activityEnd: recentActivity ? undefined : validIsoDate(canonical.activityEnd),
    votePresence: canonical.votePresence === "with" || canonical.votePresence === "without" ? canonical.votePresence : undefined,
    voteKinds: allowed(canonical.voteKinds, ["nominal", "secret", "non_nominal"]),
    individualVoteAvailability: canonical.individualVoteAvailability === "available" || canonical.individualVoteAvailability === "unavailable" ? canonical.individualVoteAvailability : undefined,
    voteResults: allowed(canonical.voteResults, ["approved", "rejected", "other", "unavailable"]),
    voteHouses: allowed(canonical.voteHouses, ["camara", "senado", "congresso"]), topics: texts(canonical.topics),
    authors: texts(canonical.authors), parties: texts(canonical.parties), regions: allowed(canonical.regions, ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO", "nao_informada"]),
    followedOnly: canonical.followedOnly === true ? true : undefined,
    order: ["updated", "presented_desc", "presented_asc", "most_movements", "most_votes"].includes(canonical.order ?? "") ? canonical.order : undefined,
  });
}

function ChoiceList({ label, name, onChange, options, selected }: Readonly<{
  label: string;
  name: string;
  onChange: (values: string[]) => void;
  options: readonly (string | PublicFilterOption)[];
  selected: readonly string[] | undefined;
}>) {
  const values = capped(selected);
  const atLimit = values.length >= MAX_SELECTED_VALUES;
  const helpId = useId();
  return (
    <fieldset aria-describedby={helpId} className="advancedFilters__choiceGroup">
      <legend>{label}</legend>
      <p aria-live="polite" className="advancedFilters__choiceHelp" id={helpId}>{atLimit ? "Limite de 20 opções atingido." : "Escolha no máximo 20 opções."}</p>
      <div className="advancedFilters__choices">
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          const checked = values.includes(value);
          return <label key={value}><input
            checked={checked}
            disabled={atLimit && !checked}
            name={name}
            onChange={(event) => onChange(event.currentTarget.checked ? capped([...values, value]) : values.filter((item) => item !== value))}
            type="checkbox"
            value={value}
          /><span>{optionLabel}</span></label>;
        })}
      </div>
    </fieldset>
  );
}

function RadioList({ label, name, onChange, options, selected }: Readonly<{
  label: string;
  name: string;
  onChange: (value: string | undefined) => void;
  options: readonly PublicFilterOption[];
  selected: string | undefined;
}>) {
  return <fieldset className="advancedFilters__choiceGroup">
    <legend>{label}</legend>
    <div className="advancedFilters__choices">{options.map((option) => <label key={option.value}><input
      checked={selected === option.value}
      name={name}
      onChange={() => onChange(option.value)}
      type="radio"
      value={option.value}
    /><span>{option.label}</span></label>)}</div>
  </fieldset>;
}

interface AdvancedFiltersProps {
  anonymousBillKeys?: AnonymousBillKey[];
  filters: PublicBillFilters;
  options: PublicFilterOptions;
}

export function AdvancedFilters({ anonymousBillKeys = EMPTY_BILL_KEYS, filters, options }: Readonly<AdvancedFiltersProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(() => canonicalFilters(filters));
  const [lastValidCount, setLastValidCount] = useState<number>();
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [activityMode, setActivityMode] = useState<ActivityMode>(() => filters.recentActivity ?? (filters.activityStart || filters.activityEnd ? "custom" : ""));
  const dialogId = useId();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const update = <K extends keyof PublicBillFilters>(key: K, value: PublicBillFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const openDialog = () => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    setIsOpen(true);
  };
  const closeDialog = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  const yearRangeInvalid = draft.yearFrom !== undefined && draft.yearTo !== undefined && draft.yearFrom > draft.yearTo;
  const presentedRangeInvalid = Boolean(draft.presentedStart && draft.presentedEnd && draft.presentedStart > draft.presentedEnd);
  const activityRangeInvalid = !draft.recentActivity && Boolean(draft.activityStart && draft.activityEnd && draft.activityStart > draft.activityEnd);
  const rangeInvalid = yearRangeInvalid || presentedRangeInvalid || activityRangeInvalid;

  useEffect(() => {
    if (!isOpen || rangeInvalid) {
      if (rangeInvalid) setPreviewState("idle");
      return;
    }
    setPreviewState("loading");
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/projects/filter-count", {
          body: JSON.stringify({ filters: strictPreviewFilters(draft), anonymousBillKeys }),
          headers: { "content-type": "application/json" }, method: "POST", signal: controller.signal,
        });
        if (!response.ok) throw new Error("Count request failed");
        const payload = await response.json() as { total?: unknown };
        if (!Number.isSafeInteger(payload.total) || Number(payload.total) < 0) throw new Error("Invalid count response");
        if (!controller.signal.aborted) { setLastValidCount(Number(payload.total)); setPreviewState("ready"); }
      } catch (error) {
        if (!controller.signal.aborted && (!(error instanceof Error) || error.name !== "AbortError")) setPreviewState("error");
      }
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [anonymousBillKeys, draft, isOpen, rangeInvalid]);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") { event.preventDefault(); closeDialog(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector)];
    const first = focusable[0]; const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const activeCount = countActiveFilters(filters);
  const countMessage = rangeInvalid ? "Corrija os intervalos para atualizar a contagem." : previewState === "error"
    ? "Não foi possível atualizar a contagem"
    : previewState === "ready" && lastValidCount !== undefined
      ? `${lastValidCount.toLocaleString("pt-BR")} ${lastValidCount === 1 ? "projeto encontrado" : "projetos encontrados"}` : "Atualizando contagem…";
  const nativeInvoker = { command: "show-modal", commandfor: dialogId };
  const nativeCloser = { command: "close", commandfor: dialogId };

  return <>
    <button {...nativeInvoker} aria-controls={dialogId} aria-haspopup="dialog" className="advancedFiltersTrigger" onClick={openDialog} ref={triggerRef} type="button">
      <span>Filtros avançados</span>{activeCount > 0 && <strong aria-label={`${activeCount} ${activeCount === 1 ? "ativo" : "ativos"}`}>{activeCount}</strong>}
    </button>
    <dialog aria-labelledby={titleId} className="advancedFilters" id={dialogId} onCancel={(event) => { event.preventDefault(); closeDialog(); }} onClose={() => setIsOpen(false)} onKeyDown={handleDialogKeyDown} onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }} ref={dialogRef}>
      <form action="/" className="advancedFilters__form" method="get">
      {draft.query && <input name="q" type="hidden" value={draft.query} />}
      <header className="advancedFilters__header"><div><span className="eyebrow">Refine sua busca</span><h2 id={titleId}>Filtros avançados</h2></div><button {...nativeCloser} aria-label="Fechar filtros avançados" onClick={closeDialog} ref={closeRef} type="button">×</button></header>
      <div className="advancedFilters__body">
        <p className="advancedFilters__intro">Combine informações oficiais para chegar aos projetos que você procura.</p>
        <section aria-labelledby={`${titleId}-identificacao`} className="advancedFilters__section">
          <h3 id={`${titleId}-identificacao`}>Identificação</h3>
          <ChoiceList label="Tipo de projeto" name="tipo" onChange={(value) => update("proposalTypes", value)} options={options.proposalTypes} selected={draft.proposalTypes} />
          <ChoiceList label="Casa legislativa" name="fonte" onChange={(value) => update("sources", value as PublicBillFilters["sources"])} options={sourceOptions.filter((option) => options.sources.includes(option.value as "camara" | "senado"))} selected={draft.sources} />
          <ChoiceList label="Situação atual" name="situacao" onChange={(value) => update("statuses", value)} options={options.statuses} selected={draft.statuses} />
          <ChoiceList label="Tema" name="tema" onChange={(value) => update("topics", value)} options={options.topics} selected={draft.topics} />
          <div className="advancedFilters__fields">
            <label>Número do projeto<input min="1" name="numero" onChange={(event) => update("proposalNumber", event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} type="number" value={draft.proposalNumber ?? ""} /></label>
            <label>Ano inicial<select aria-invalid={yearRangeInvalid} name="anoInicio" onChange={(event) => update("yearFrom", event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} value={draft.yearFrom ?? ""}><option value="">Qualquer ano</option>{options.years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
            <label>Ano final<select aria-invalid={yearRangeInvalid} name="anoFim" onChange={(event) => update("yearTo", event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} value={draft.yearTo ?? ""}><option value="">Qualquer ano</option>{options.years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
          </div>
          {yearRangeInvalid && <p className="advancedFilters__error" role="alert">O ano inicial deve ser anterior ou igual ao ano final.</p>}
        </section>
        <section aria-labelledby={`${titleId}-tramitacao`} className="advancedFilters__section">
          <h3 id={`${titleId}-tramitacao`}>Tramitação</h3>
          <ChoiceList label="Casa de origem" name="origem" onChange={(value) => update("originHouses", value as PublicBillFilters["originHouses"])} options={options.originHouses} selected={draft.originHouses} />
          <ChoiceList label="Casa atual" name="casaAtual" onChange={(value) => update("currentHouses", value as PublicBillFilters["currentHouses"])} options={options.currentHouses.map((option) => option.value === "nao_informada" ? { ...option, label: "Não informada" } : option)} selected={draft.currentHouses} />
          <ChoiceList label="Fase geral" name="fase" onChange={(value) => update("stages", value as PublicBillFilters["stages"])} options={options.stages} selected={draft.stages} />
          <div className="advancedFilters__fields advancedFilters__fields--dates">
            <label>Apresentada desde<input aria-invalid={presentedRangeInvalid} name="apresentadaInicio" onChange={(event) => update("presentedStart", event.currentTarget.value || undefined)} type="date" value={draft.presentedStart ?? ""} /></label>
            <label>Apresentada até<input aria-invalid={presentedRangeInvalid} name="apresentadaFim" onChange={(event) => update("presentedEnd", event.currentTarget.value || undefined)} type="date" value={draft.presentedEnd ?? ""} /></label>
            <label>Atividade recente<select aria-label="Período de atividade" name="atividadeRecente" onChange={(event) => {
              const value = event.currentTarget.value;
              const mode = value as ActivityMode;
              setActivityMode(mode);
              setDraft((current) => compactFilters({
                ...current,
                recentActivity: value === "24h" || value === "7d" || value === "30d" ? value : undefined,
                activityStart: value === "custom" ? current.activityStart : undefined,
                activityEnd: value === "custom" ? current.activityEnd : undefined,
              }));
            }} value={activityMode}><option value="">Qualquer período</option><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="custom">Período personalizado</option></select></label>
            <label>Atividade desde<input aria-invalid={activityRangeInvalid} name="atividadeInicio" onChange={(event) => { setActivityMode("custom"); setDraft((current) => ({ ...current, recentActivity: undefined, activityStart: event.currentTarget.value || undefined })); }} type="date" value={draft.activityStart ?? ""} /></label>
            <label>Atividade até<input aria-invalid={activityRangeInvalid} name="atividadeFim" onChange={(event) => { setActivityMode("custom"); setDraft((current) => ({ ...current, recentActivity: undefined, activityEnd: event.currentTarget.value || undefined })); }} type="date" value={draft.activityEnd ?? ""} /></label>
          </div>
          {presentedRangeInvalid && <p className="advancedFilters__error" role="alert">A data inicial de apresentação deve ser anterior ou igual à data final.</p>}
          {activityRangeInvalid && <p className="advancedFilters__error" role="alert">A data inicial de atividade deve ser anterior ou igual à data final.</p>}
        </section>
        <section aria-labelledby={`${titleId}-votacoes`} className="advancedFilters__section">
          <h3 id={`${titleId}-votacoes`}>Votações</h3>
          <RadioList label="Há votação registrada?" name="votacao" onChange={(value) => update("votePresence", value as PublicBillFilters["votePresence"])} options={[{ value: "with", label: "Com votação" }, { value: "without", label: "Sem votação" }]} selected={draft.votePresence} />
          <ChoiceList label="Tipo de votação" name="tipoVotacao" onChange={(value) => update("voteKinds", value as PublicBillFilters["voteKinds"])} options={options.voteKinds} selected={draft.voteKinds} />
          <RadioList label="Votos individuais" name="votosIndividuais" onChange={(value) => update("individualVoteAvailability", value as PublicBillFilters["individualVoteAvailability"])} options={[{ value: "available", label: "Disponíveis" }, { value: "unavailable", label: "Não disponíveis" }]} selected={draft.individualVoteAvailability} />
          <ChoiceList label="Resultado" name="resultado" onChange={(value) => update("voteResults", value as PublicBillFilters["voteResults"])} options={options.voteResults} selected={draft.voteResults} />
          <ChoiceList label="Casa da votação" name="casaVotacao" onChange={(value) => update("voteHouses", value as PublicBillFilters["voteHouses"])} options={options.voteHouses} selected={draft.voteHouses} />
        </section>
        <section aria-labelledby={`${titleId}-autoria`} className="advancedFilters__section">
          <h3 id={`${titleId}-autoria`}>Autoria e representação</h3>
          <ChoiceList label="Autoria" name="autor" onChange={(value) => update("authors", value)} options={options.authors} selected={draft.authors} />
          <ChoiceList label="Partido" name="partido" onChange={(value) => update("parties", value)} options={options.parties} selected={draft.parties} />
          <ChoiceList label="Estado ou região" name="uf" onChange={(value) => update("regions", value)} options={options.regions.map((option) => option.value === "nao_informada" ? { ...option, label: "Não informada" } : option)} selected={draft.regions} />
          <fieldset className="advancedFilters__choiceGroup advancedFilters__followedGroup">
            <legend>Projetos acompanhados</legend>
            <label className="advancedFilters__standaloneChoice"><input checked={draft.followedOnly ?? false} name="acompanhando" onChange={(event) => update("followedOnly", event.currentTarget.checked || undefined)} type="checkbox" value="1" /><span>Mostrar somente projetos que acompanho</span></label>
          </fieldset>
        </section>
        <section aria-labelledby={`${titleId}-ordem`} className="advancedFilters__section">
          <h3 id={`${titleId}-ordem`}>Ordem dos resultados</h3>
          <label className="advancedFilters__selectLabel">Ordenar por<select name="ordem" onChange={(event) => update("order", event.currentTarget.value as PublicBillFilters["order"])} value={draft.order ?? "updated"}><option value="updated">Atividade mais recente</option><option value="presented_desc">Apresentação mais recente</option><option value="presented_asc">Apresentação mais antiga</option><option value="most_movements">Mais movimentações</option><option value="most_votes">Mais votações</option></select></label>
        </section>
      </div>
      <footer className="advancedFilters__footer"><p aria-live="polite" role="status">{countMessage}</p><div><a className="advancedFilters__clear" href="/">Limpar tudo</a><button className="advancedFilters__apply" disabled={rangeInvalid} type="submit">{lastValidCount === undefined ? "Aplicar filtros" : `Ver ${lastValidCount.toLocaleString("pt-BR")} ${lastValidCount === 1 ? "projeto" : "projetos"}`}</button></div></footer>
      </form>
    </dialog>
  </>;
}
