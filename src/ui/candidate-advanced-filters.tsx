"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation.js";

import type {
  CandidateFilterOption,
  CandidateFilterOptions,
  CandidateFilters,
  CandidateFundingKind,
  CandidateLawmakerHouse,
  CandidateOrder,
} from "#/server/candidates/read-models";
import { toCandidateFilterInput } from "#/server/candidates/filter-contract";
import { centsToReais, reaisToCents } from "#/server/candidates/search-params";
import { buildCandidateHref, countCandidateFilters } from "#/server/candidates/search-params";

type PreviewState = "idle" | "loading" | "ready" | "error";
type MoneyKey = "assetMinCents" | "assetMaxCents" | "revenueMinCents" | "revenueMaxCents" | "expenseMinCents" | "expenseMaxCents" | "balanceMinCents" | "balanceMaxCents";

const MAX_SELECTED_VALUES = 20;
const MAX_VISIBLE_SUGGESTIONS = 8;
const focusableSelector = "button:not([disabled]),[href],input:not([type='hidden']):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1'])";
const moneyKeys: MoneyKey[] = [
  "assetMinCents", "assetMaxCents", "revenueMinCents", "revenueMaxCents",
  "expenseMinCents", "expenseMaxCents", "balanceMinCents", "balanceMaxCents",
];

function capped(values: readonly string[] | undefined) {
  return [...new Set(values?.map((value) => value.trim()).filter(Boolean))].slice(0, MAX_SELECTED_VALUES);
}

function candidateDraft(filters: CandidateFilters): CandidateFilters {
  const { page: _page, pageSize: _pageSize, ...withoutPagination } = filters;
  const draft = { ...withoutPagination };
  for (const key of [
    "offices", "regions", "parties", "statuses", "federations", "coalitions", "genders", "races",
    "educations", "occupations", "assetCategories", "fundingKinds", "lawmakerHouses", "topics",
  ] as const) {
    const values = withoutPagination[key];
    if (values) (draft as Record<string, unknown>)[key] = capped(values as string[]);
  }
  if (withoutPagination.electionYears) draft.electionYears = [...new Set(withoutPagination.electionYears)].slice(0, MAX_SELECTED_VALUES);
  if (withoutPagination.rounds) draft.rounds = [...new Set(withoutPagination.rounds)].slice(0, MAX_SELECTED_VALUES);
  if (draft.regions?.length) draft.allBrazil = undefined;
  return draft;
}

function moneyDraft(filters: CandidateFilters): Record<MoneyKey, string> {
  return Object.fromEntries(moneyKeys.map((key) => [key, filters[key] === undefined ? "" : (centsToReais(filters[key]) ?? "").replace(".", ",")])) as Record<MoneyKey, string>;
}

function parseMoneyInput(value: string): bigint | undefined {
  const normalized = value.trim().replace(",", ".");
  return reaisToCents(normalized);
}

export function candidatePreviewInput(filters: CandidateFilters) {
  const { page: _page, pageSize: _pageSize, ...withoutPagination } = candidateDraft(filters);
  return toCandidateFilterInput(withoutPagination);
}

function folded(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
}

type ResolvedChoice = CandidateFilterOption & { unavailable: boolean };

function resolveChoices(
  options: readonly (string | CandidateFilterOption)[],
  selected: readonly string[] | undefined,
): ResolvedChoice[] {
  const catalog = new Map(options.map((option) => {
    const resolved = typeof option === "string" ? { value: option, label: option } : option;
    return [resolved.value, { ...resolved, unavailable: false }] as const;
  }));
  const unavailable = capped(selected)
    .filter((value) => !catalog.has(value))
    .map((value) => ({ value, label: value, unavailable: true }));
  return [...unavailable, ...catalog.values()];
}

function ChoiceOptions({ atLimit, name, onChange, options, selected }: Readonly<{
  atLimit: boolean;
  name: string;
  onChange: (values: string[]) => void;
  options: readonly ResolvedChoice[];
  selected: readonly string[];
}>) {
  return options.map((option) => {
    const checked = selected.includes(option.value);
    const accessibleLabel = option.unavailable ? `${option.label} — indisponível` : undefined;
    return (
      <label data-unavailable={option.unavailable || undefined} key={option.value}>
        <input
          aria-label={accessibleLabel}
          checked={checked}
          disabled={atLimit && !checked}
          name={name}
          onChange={(event) => onChange(event.currentTarget.checked
            ? capped([...selected, option.value])
            : selected.filter((item) => item !== option.value))}
          type="checkbox"
          value={option.value}
        />
        <span>{option.label}{option.unavailable ? <small className="advancedFilters__unavailable"> — indisponível</small> : null}</span>
      </label>
    );
  });
}

function ChoiceList({ label, name, onChange, options, selected, searchable = false, searchLabel }: Readonly<{
  label: string;
  name: string;
  onChange: (values: string[]) => void;
  options: readonly (string | CandidateFilterOption)[];
  selected: readonly string[] | undefined;
  searchable?: boolean;
  searchLabel?: string;
}>) {
  const [query, setQuery] = useState("");
  const values = capped(selected);
  const atLimit = values.length >= MAX_SELECTED_VALUES;
  const helpId = useId();
  const listId = useId();
  const resolved = resolveChoices(options, values);
  const normalizedQuery = folded(query.trim());
  const selectedChoices = resolved.filter((option) => values.includes(option.value));
  const suggestions = resolved
    .filter((option) => !values.includes(option.value))
    .filter((option) => !searchable || !normalizedQuery || folded(option.label).includes(normalizedQuery))
    .slice(0, searchable ? MAX_VISIBLE_SUGGESTIONS : Number.POSITIVE_INFINITY);
  const visible = [...selectedChoices, ...suggestions];
  return (
    <fieldset aria-describedby={helpId} className={`advancedFilters__choiceGroup${searchable ? " advancedFilters__searchable" : ""}`}>
      <legend>{label}</legend>
      <p aria-live="polite" className="advancedFilters__choiceHelp" id={helpId}>
        {atLimit ? "Limite de 20 opções atingido." : searchable ? "Pesquise e escolha até 20 opções." : "Escolha no máximo 20 opções."}
      </p>
      {searchable ? (
        <label className="advancedFilters__search">
          <span className="srOnly">{searchLabel ?? `Pesquisar ${label.toLocaleLowerCase("pt-BR")}`}</span>
          <input
            aria-controls={listId}
            maxLength={200}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={searchLabel ?? `Pesquisar ${label.toLocaleLowerCase("pt-BR")}`}
            type="search"
            value={query}
          />
        </label>
      ) : null}
      <div className="advancedFilters__choices" id={listId}>
        <ChoiceOptions atLimit={atLimit} name={name} onChange={onChange} options={visible} selected={values} />
        {!visible.length ? <p className="advancedFilters__noSuggestion">Nenhuma opção publicada pela fonte.</p> : null}
      </div>
    </fieldset>
  );
}

function RadioList({ label, name, onChange, options, selected }: Readonly<{
  label: string;
  name: string;
  onChange: (value: string | undefined) => void;
  options: readonly CandidateFilterOption[];
  selected: string | undefined;
}>) {
  return (
    <fieldset className="advancedFilters__choiceGroup">
      <legend>{label}</legend>
      <div className="advancedFilters__choices">
        {options.map((option) => (
          <label key={option.value || "all"}>
            <input checked={selected === (option.value || undefined)} name={name} onChange={() => onChange(option.value || undefined)} type="radio" value={option.value} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FilterSection({ children, id, title }: Readonly<{ children: ReactNode; id: string; title: string }>) {
  return (
    <section aria-labelledby={id} className="advancedFilters__section candidateAdvancedFilters__section">
      <details open>
        <summary id={id}><span>{title}</span><span aria-hidden="true">+</span></summary>
        <div className="advancedFilters__sectionBody">{children}</div>
      </details>
    </section>
  );
}

function BooleanSelect({ label, name, onChange, value }: Readonly<{
  label: string;
  name: string;
  onChange: (value: boolean | undefined) => void;
  value: boolean | undefined;
}>) {
  return (
    <label>{label}
      <select aria-label={label} name={value === undefined ? undefined : name} onChange={(event) => onChange(event.currentTarget.value === "1" ? true : event.currentTarget.value === "0" ? false : undefined)} value={value === undefined ? "" : value ? "1" : "0"}>
        <option value="">Qualquer situação</option>
        <option value="1">Disponível</option>
        <option value="0">Não disponível</option>
      </select>
    </label>
  );
}

const orderOptions: Array<{ value: CandidateOrder; label: string }> = [
  { value: "name", label: "Nome" },
  { value: "number", label: "Número" },
  { value: "updated", label: "Atualização" },
  { value: "assets_desc", label: "Patrimônio" },
  { value: "revenue_desc", label: "Receita" },
  { value: "expenses_desc", label: "Despesa" },
  { value: "projects_desc", label: "Projetos associados" },
  { value: "votes_desc", label: "Votações registradas" },
];

export interface CandidateAdvancedFiltersProps {
  authenticated: boolean;
  filters: CandidateFilters;
  options: CandidateFilterOptions;
}

export function CandidateAdvancedFilters({ authenticated, filters, options }: Readonly<CandidateAdvancedFiltersProps>) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(() => candidateDraft(filters));
  const [moneyInputs, setMoneyInputs] = useState(() => moneyDraft(filters));
  const [lastValidCount, setLastValidCount] = useState<number>();
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const dialogId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const ageErrorId = useId();
  const assetValueErrorId = useId();
  const assetCountErrorId = useId();
  const revenueErrorId = useId();
  const expenseErrorId = useId();
  const balanceErrorId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDraft(candidateDraft(filters));
    setMoneyInputs(moneyDraft(filters));
    setLastValidCount(undefined);
    setPreviewState("idle");
  }, [filters]);

  const update = <K extends keyof CandidateFilters>(key: K, value: CandidateFilters[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const updateRegions = (regions: string[]) => {
    setDraft((current) => ({
      ...current,
      allBrazil: regions.length ? undefined : true,
      regions: regions.length ? regions : undefined,
    }));
  };
  const updateMoney = (key: MoneyKey, value: string) => {
    setMoneyInputs((current) => ({ ...current, [key]: value }));
    update(key, value.trim() ? parseMoneyInput(value) : undefined);
  };

  const invalidMoney = (key: MoneyKey) => moneyInputs[key].trim() !== "" && parseMoneyInput(moneyInputs[key]) === undefined;
  const ageInvalid = draft.ageMin !== undefined && draft.ageMax !== undefined && draft.ageMin > draft.ageMax;
  const assetValueSyntaxInvalid = invalidMoney("assetMinCents") || invalidMoney("assetMaxCents");
  const revenueSyntaxInvalid = invalidMoney("revenueMinCents") || invalidMoney("revenueMaxCents");
  const expenseSyntaxInvalid = invalidMoney("expenseMinCents") || invalidMoney("expenseMaxCents");
  const balanceSyntaxInvalid = invalidMoney("balanceMinCents") || invalidMoney("balanceMaxCents");
  const assetValueInvalid = assetValueSyntaxInvalid || (draft.assetMinCents !== undefined && draft.assetMaxCents !== undefined && draft.assetMinCents > draft.assetMaxCents);
  const assetCountInvalid = draft.assetCountMin !== undefined && draft.assetCountMax !== undefined && draft.assetCountMin > draft.assetCountMax;
  const revenueInvalid = revenueSyntaxInvalid || (draft.revenueMinCents !== undefined && draft.revenueMaxCents !== undefined && draft.revenueMinCents > draft.revenueMaxCents);
  const expenseInvalid = expenseSyntaxInvalid || (draft.expenseMinCents !== undefined && draft.expenseMaxCents !== undefined && draft.expenseMinCents > draft.expenseMaxCents);
  const balanceInvalid = balanceSyntaxInvalid || (draft.balanceMinCents !== undefined && draft.balanceMaxCents !== undefined && draft.balanceMinCents > draft.balanceMaxCents);
  const rangeInvalid = ageInvalid || assetValueInvalid || assetCountInvalid || revenueInvalid || expenseInvalid || balanceInvalid;

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

  useEffect(() => {
    if (!isOpen || rangeInvalid) {
      if (rangeInvalid) setPreviewState("idle");
      return;
    }
    setPreviewState("loading");
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/candidates/filter-count", {
          body: JSON.stringify({ filters: candidatePreviewInput(draft) }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Count request failed");
        const payload = await response.json() as { total?: unknown };
        if (!Number.isSafeInteger(payload.total) || Number(payload.total) < 0) throw new Error("Invalid count response");
        if (!controller.signal.aborted) {
          setLastValidCount(Number(payload.total));
          setPreviewState("ready");
        }
      } catch (error) {
        if (!controller.signal.aborted && (!(error instanceof Error) || error.name !== "AbortError")) setPreviewState("error");
      }
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [draft, isOpen, rangeInvalid]);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => (
      !element.hidden && element.getAttribute("aria-hidden") !== "true" && !element.closest("[hidden]") && !element.closest("details:not([open])")
    ));
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

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rangeInvalid) return;
    router.push(buildCandidateHref(draft, 1));
    closeDialog();
  };
  const activeCount = countCandidateFilters(filters);
  const triggerLabel = activeCount
    ? `Filtros avançados · ${activeCount} ${activeCount === 1 ? "ativo" : "ativos"}`
    : "Filtros avançados";
  const countMessage = rangeInvalid
    ? "Corrija os intervalos para atualizar a contagem."
    : previewState === "error"
      ? lastValidCount === undefined
        ? "Não foi possível atualizar a contagem."
        : `Não foi possível atualizar a contagem. Última contagem: ${lastValidCount.toLocaleString("pt-BR")} ${lastValidCount === 1 ? "candidatura" : "candidaturas"}.`
      : previewState === "ready" && lastValidCount !== undefined
        ? `${lastValidCount.toLocaleString("pt-BR")} ${lastValidCount === 1 ? "candidatura encontrada" : "candidaturas encontradas"}`
        : "Atualizando contagem…";
  const nativeInvoker = { command: "show-modal", commandfor: dialogId };
  const nativeCloser = { command: "close", commandfor: dialogId };
  const bool = (key: keyof CandidateFilters) => (value: boolean | undefined) => update(key, value as never);

  return (
    <>
      <button
        {...nativeInvoker}
        aria-controls={dialogId}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        className="advancedFiltersTrigger candidateAdvancedFiltersTrigger"
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        <span>Filtros avançados</span>{activeCount ? <strong aria-hidden="true">{activeCount}</strong> : null}
      </button>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="advancedFilters candidateAdvancedFilters"
        id={dialogId}
        onCancel={(event) => { event.preventDefault(); closeDialog(); }}
        onClose={() => setIsOpen(false)}
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
        ref={dialogRef}
      >
        <form action="/candidatos" className="advancedFilters__form" method="get" onSubmit={applyFilters}>
          {draft.query ? <input name="q" type="hidden" value={draft.query} /> : null}
          {draft.allBrazil ? <input name="abrangencia" type="hidden" value="brasil" /> : null}
          <header className="advancedFilters__header">
            <div><span className="eyebrow">Refine os fatos oficiais</span><h2 id={titleId}>Filtros avançados de candidatos</h2></div>
            <button {...nativeCloser} aria-label="Fechar filtros avançados" onClick={closeDialog} ref={closeRef} type="button">×</button>
          </header>
          <div className="advancedFilters__body">
            <p className="advancedFilters__intro" id={descriptionId}>Combine informações declaradas ao TSE e histórico parlamentar confirmado, sem notas ou recomendação de voto.</p>

            <FilterSection id={`${titleId}-eleicao`} title="Eleição">
              <ChoiceList label="Ano da eleição" name="ano" onChange={(values) => update("electionYears", values.map(Number))} options={options.electionYears.map(String)} selected={draft.electionYears?.map(String)} />
              <ChoiceList label="Turno" name="turno" onChange={(values) => update("rounds", values.map(Number))} options={options.rounds.map((value) => ({ value: String(value), label: `${value}º turno` }))} selected={draft.rounds?.map(String)} />
              <ChoiceList label="Cargo" name="cargo" onChange={(values) => update("offices", values as CandidateFilters["offices"])} options={options.offices} selected={draft.offices} />
              <ChoiceList label="UF ou circunscrição" name="uf" onChange={updateRegions} options={options.regions} selected={draft.regions} />
              <ChoiceList label="Situação da candidatura" name="situacao" onChange={(values) => update("statuses", values)} options={options.statuses} searchLabel="Pesquisar situações" searchable selected={draft.statuses} />
            </FilterSection>

            <FilterSection id={`${titleId}-organizacao`} title="Organização política">
              <ChoiceList label="Partido" name="partido" onChange={(values) => update("parties", values)} options={options.parties} searchLabel="Pesquisar partidos" searchable selected={draft.parties} />
              <ChoiceList label="Federação" name="federacao" onChange={(values) => update("federations", values)} options={options.federations} searchLabel="Pesquisar federações" searchable selected={draft.federations} />
              <ChoiceList label="Coligação" name="coligacao" onChange={(values) => update("coalitions", values)} options={options.coalitions} searchLabel="Pesquisar coligações" searchable selected={draft.coalitions} />
            </FilterSection>

            <FilterSection id={`${titleId}-perfil`} title="Perfil informado ao TSE">
              <div className="advancedFilters__fields advancedFilters__fields--two">
                <label>Idade mínima<input aria-describedby={ageInvalid ? ageErrorId : undefined} aria-errormessage={ageInvalid ? ageErrorId : undefined} aria-invalid={ageInvalid} max="150" min="0" name={draft.ageMin === undefined ? undefined : "idadeMin"} onChange={(event) => update("ageMin", event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} type="number" value={draft.ageMin ?? ""} /></label>
                <label>Idade máxima<input aria-describedby={ageInvalid ? ageErrorId : undefined} aria-errormessage={ageInvalid ? ageErrorId : undefined} aria-invalid={ageInvalid} max="150" min="0" name={draft.ageMax === undefined ? undefined : "idadeMax"} onChange={(event) => update("ageMax", event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} type="number" value={draft.ageMax ?? ""} /></label>
              </div>
              {ageInvalid ? <p className="advancedFilters__error" id={ageErrorId} role="alert">A idade mínima deve ser menor ou igual à idade máxima.</p> : null}
              <ChoiceList label="Gênero" name="genero" onChange={(values) => update("genders", values)} options={options.genders} selected={draft.genders} />
              <ChoiceList label="Raça ou cor" name="raca" onChange={(values) => update("races", values)} options={options.races} selected={draft.races} />
              <ChoiceList label="Escolaridade" name="escolaridade" onChange={(values) => update("educations", values)} options={options.educations} searchLabel="Pesquisar escolaridade" searchable selected={draft.educations} />
              <ChoiceList label="Ocupação" name="ocupacao" onChange={(values) => update("occupations", values)} options={options.occupations} searchLabel="Pesquisar ocupações" searchable selected={draft.occupations} />
            </FilterSection>

            <FilterSection id={`${titleId}-patrimonio`} title="Patrimônio">
              <RadioList label="Declarou bens" name="declarouBens" onChange={(value) => update("declaredAssets", value as CandidateFilters["declaredAssets"])} options={[{ value: "", label: "Qualquer situação" }, { value: "yes", label: "Com bens declarados" }, { value: "no", label: "Sem bens declarados" }]} selected={draft.declaredAssets} />
              <div className="advancedFilters__fields advancedFilters__fields--two">
                <label>Patrimônio mínimo<input aria-describedby={assetValueInvalid ? assetValueErrorId : undefined} aria-errormessage={assetValueInvalid ? assetValueErrorId : undefined} aria-invalid={assetValueInvalid} inputMode="decimal" name={moneyInputs.assetMinCents ? "patrimonioMin" : undefined} onChange={(event) => updateMoney("assetMinCents", event.currentTarget.value)} placeholder="0,00" type="text" value={moneyInputs.assetMinCents} /></label>
                <label>Patrimônio máximo<input aria-describedby={assetValueInvalid ? assetValueErrorId : undefined} aria-errormessage={assetValueInvalid ? assetValueErrorId : undefined} aria-invalid={assetValueInvalid} inputMode="decimal" name={moneyInputs.assetMaxCents ? "patrimonioMax" : undefined} onChange={(event) => updateMoney("assetMaxCents", event.currentTarget.value)} placeholder="0,00" type="text" value={moneyInputs.assetMaxCents} /></label>
                <label>Quantidade mínima de bens<input aria-describedby={assetCountInvalid ? assetCountErrorId : undefined} aria-errormessage={assetCountInvalid ? assetCountErrorId : undefined} aria-invalid={assetCountInvalid} min="0" name={draft.assetCountMin === undefined ? undefined : "quantidadeBensMin"} onChange={(event) => update("assetCountMin", event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} type="number" value={draft.assetCountMin ?? ""} /></label>
                <label>Quantidade máxima de bens<input aria-describedby={assetCountInvalid ? assetCountErrorId : undefined} aria-errormessage={assetCountInvalid ? assetCountErrorId : undefined} aria-invalid={assetCountInvalid} min="0" name={draft.assetCountMax === undefined ? undefined : "quantidadeBensMax"} onChange={(event) => update("assetCountMax", event.currentTarget.value ? Number(event.currentTarget.value) : undefined)} type="number" value={draft.assetCountMax ?? ""} /></label>
              </div>
              {assetValueInvalid ? <p className="advancedFilters__error" id={assetValueErrorId} role="alert">{assetValueSyntaxInvalid ? "Informe valores de patrimônio em reais, usando apenas números e centavos." : "O patrimônio mínimo deve ser menor ou igual ao patrimônio máximo."}</p> : null}
              {assetCountInvalid ? <p className="advancedFilters__error" id={assetCountErrorId} role="alert">A quantidade mínima deve ser menor ou igual à quantidade máxima.</p> : null}
              <ChoiceList label="Categorias de bens" name="categoriaBem" onChange={(values) => update("assetCategories", values)} options={options.assetCategories} searchLabel="Pesquisar categorias de bens" searchable selected={draft.assetCategories} />
            </FilterSection>

            <FilterSection id={`${titleId}-campanha`} title="Campanha">
              <div className="advancedFilters__fields advancedFilters__fields--two">
                <label>Receita mínima<input aria-describedby={revenueInvalid ? revenueErrorId : undefined} aria-errormessage={revenueInvalid ? revenueErrorId : undefined} aria-invalid={revenueInvalid} inputMode="decimal" name={moneyInputs.revenueMinCents ? "receitaMin" : undefined} onChange={(event) => updateMoney("revenueMinCents", event.currentTarget.value)} type="text" value={moneyInputs.revenueMinCents} /></label>
                <label>Receita máxima<input aria-describedby={revenueInvalid ? revenueErrorId : undefined} aria-errormessage={revenueInvalid ? revenueErrorId : undefined} aria-invalid={revenueInvalid} inputMode="decimal" name={moneyInputs.revenueMaxCents ? "receitaMax" : undefined} onChange={(event) => updateMoney("revenueMaxCents", event.currentTarget.value)} type="text" value={moneyInputs.revenueMaxCents} /></label>
                <label>Despesa mínima<input aria-describedby={expenseInvalid ? expenseErrorId : undefined} aria-errormessage={expenseInvalid ? expenseErrorId : undefined} aria-invalid={expenseInvalid} inputMode="decimal" name={moneyInputs.expenseMinCents ? "despesaMin" : undefined} onChange={(event) => updateMoney("expenseMinCents", event.currentTarget.value)} type="text" value={moneyInputs.expenseMinCents} /></label>
                <label>Despesa máxima<input aria-describedby={expenseInvalid ? expenseErrorId : undefined} aria-errormessage={expenseInvalid ? expenseErrorId : undefined} aria-invalid={expenseInvalid} inputMode="decimal" name={moneyInputs.expenseMaxCents ? "despesaMax" : undefined} onChange={(event) => updateMoney("expenseMaxCents", event.currentTarget.value)} type="text" value={moneyInputs.expenseMaxCents} /></label>
                <label>Saldo mínimo<input aria-describedby={balanceInvalid ? balanceErrorId : undefined} aria-errormessage={balanceInvalid ? balanceErrorId : undefined} aria-invalid={balanceInvalid} inputMode="decimal" name={moneyInputs.balanceMinCents ? "saldoMin" : undefined} onChange={(event) => updateMoney("balanceMinCents", event.currentTarget.value)} type="text" value={moneyInputs.balanceMinCents} /></label>
                <label>Saldo máximo<input aria-describedby={balanceInvalid ? balanceErrorId : undefined} aria-errormessage={balanceInvalid ? balanceErrorId : undefined} aria-invalid={balanceInvalid} inputMode="decimal" name={moneyInputs.balanceMaxCents ? "saldoMax" : undefined} onChange={(event) => updateMoney("balanceMaxCents", event.currentTarget.value)} type="text" value={moneyInputs.balanceMaxCents} /></label>
              </div>
              {revenueInvalid ? <p className="advancedFilters__error" id={revenueErrorId} role="alert">{revenueSyntaxInvalid ? "Informe valores de receita em reais, usando apenas números e centavos." : "A receita mínima deve ser menor ou igual à receita máxima."}</p> : null}
              {expenseInvalid ? <p className="advancedFilters__error" id={expenseErrorId} role="alert">{expenseSyntaxInvalid ? "Informe valores de despesa em reais, usando apenas números e centavos." : "A despesa mínima deve ser menor ou igual à despesa máxima."}</p> : null}
              {balanceInvalid ? <p className="advancedFilters__error" id={balanceErrorId} role="alert">{balanceSyntaxInvalid ? "Informe valores de saldo em reais, usando apenas números e centavos." : "O saldo mínimo deve ser menor ou igual ao saldo máximo."}</p> : null}
              <ChoiceList label="Origem predominante dos recursos" name="origemRecurso" onChange={(values) => update("fundingKinds", values as CandidateFundingKind[])} options={options.fundingKinds} selected={draft.fundingKinds} />
            </FilterSection>

            <FilterSection id={`${titleId}-disponibilidade`} title="Disponibilidade">
              <fieldset className="advancedFilters__choiceGroup">
                <legend>Disponibilidade dos dados</legend>
                <div className="advancedFilters__fields advancedFilters__fields--two candidateAdvancedFilters__selectGrid">
                  <BooleanSelect label="Foto oficial" name="comFoto" onChange={bool("hasPhoto")} value={draft.hasPhoto} />
                  <BooleanSelect label="Redes sociais" name="comRedes" onChange={bool("hasSocial")} value={draft.hasSocial} />
                  <BooleanSelect label="Proposta de governo" name="comProposta" onChange={bool("hasGovernmentPlan")} value={draft.hasGovernmentPlan} />
                  <BooleanSelect label="Certidões" name="comCertidoes" onChange={bool("hasCertificates")} value={draft.hasCertificates} />
                  <BooleanSelect label="Dados financeiros" name="comFinancas" onChange={bool("hasFinance")} value={draft.hasFinance} />
                  <BooleanSelect label="Histórico parlamentar confirmado" name="comHistorico" onChange={bool("hasConfirmedLawmaker")} value={draft.hasConfirmedLawmaker} />
                </div>
              </fieldset>
            </FilterSection>

            <FilterSection id={`${titleId}-experiencia`} title="Experiência confirmada">
              <ChoiceList label="Casa legislativa" name="casa" onChange={(values) => update("lawmakerHouses", values as CandidateLawmakerHouse[])} options={options.lawmakerHouses} selected={draft.lawmakerHouses} />
              <label className="advancedFilters__selectLabel">Mandato parlamentar
                <select aria-label="Mandato parlamentar" name={draft.activeMandate === undefined ? undefined : "mandatoAtivo"} onChange={(event) => update("activeMandate", event.currentTarget.value === "1" ? true : event.currentTarget.value === "0" ? false : undefined)} value={draft.activeMandate === undefined ? "" : draft.activeMandate ? "1" : "0"}>
                  <option value="">Qualquer período</option><option value="1">Em exercício</option><option value="0">Mandato anterior</option>
                </select>
              </label>
              <ChoiceList label="Temas de atuação" name="tema" onChange={(values) => update("topics", values)} options={options.topics} searchLabel="Pesquisar temas de atuação" searchable selected={draft.topics} />
            </FilterSection>

            <FilterSection id={`${titleId}-acompanhamento`} title="Acompanhamento">
              <fieldset className="advancedFilters__choiceGroup advancedFilters__followedGroup">
                <legend>Candidatos acompanhados</legend>
                <label className="advancedFilters__standaloneChoice">
                  <input checked={draft.followedOnly ?? false} disabled={!authenticated} name="acompanhando" onChange={(event) => update("followedOnly", event.currentTarget.checked || undefined)} type="checkbox" value="1" />
                  <span>Somente candidatos seguidos</span>
                </label>
                {!authenticated ? <a href={`/entrar?next=${encodeURIComponent(buildCandidateHref({ ...draft, followedOnly: true }, 1))}`}>Entrar para usar este filtro</a> : null}
              </fieldset>
            </FilterSection>

            <FilterSection id={`${titleId}-ordem`} title="Ordenação">
              <label className="advancedFilters__selectLabel">Ordenar por
                <select aria-label="Ordenar por" name="ordem" onChange={(event) => update("order", event.currentTarget.value as CandidateOrder)} value={draft.order ?? "name"}>
                  {orderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </FilterSection>
          </div>
          <footer className="advancedFilters__footer">
            <p aria-live="polite" role="status">{countMessage}</p>
            <div>
              <a className="advancedFilters__clear" href={draft.allBrazil ? "/candidatos?abrangencia=brasil" : "/candidatos"}>Limpar tudo</a>
              <button className="advancedFilters__apply" disabled={rangeInvalid} type="submit">
                {lastValidCount === undefined ? "Aplicar filtros" : `Ver ${lastValidCount.toLocaleString("pt-BR")} ${lastValidCount === 1 ? "candidatura" : "candidaturas"}`}
              </button>
            </div>
          </footer>
        </form>
      </dialog>
    </>
  );
}
