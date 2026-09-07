"use client";

import { useState } from "react";

import type { PublicTimelineItem, PublicVoteEvent } from "#/server/public/read-models";
import { formatDateTime, houseLabel } from "#/ui/format";
import { ExternalIcon } from "#/ui/icons";
import { voteEventAnchorId } from "#/ui/vote-event";

type TimelineView = "simple" | "detailed";
type TimelineHouse = PublicTimelineItem["house"];

interface PlainMovement {
  title: string;
  explanation: string;
}

type TimelineEntry =
  | { kind: "movement"; occurredAt: string; item: PublicTimelineItem; position: number }
  | { kind: "votes"; occurredAt: string; events: PublicVoteEvent[]; position: number };

interface TimelineGroup {
  house: TimelineHouse;
  entries: TimelineEntry[];
  movementCount: number;
  voteCount: number;
}

function timelineHouseTitle(house: TimelineHouse) {
  if (house === "camara") return "Tramitação na Câmara";
  if (house === "senado") return "Tramitação no Senado";
  return "Tramitação no Congresso Nacional";
}

function timelineGroups(items: PublicTimelineItem[], voteEvents: PublicVoteEvent[]): TimelineGroup[] {
  const voteMoments = new Map<string, { occurredAt: string; house: TimelineHouse; events: PublicVoteEvent[]; position: number }>();

  for (const [position, event] of voteEvents.entries()) {
    const key = `${event.house}\u0000${event.occurredAt}`;
    const moment = voteMoments.get(key);
    if (moment) {
      moment.events.push(event);
    } else {
      voteMoments.set(key, { occurredAt: event.occurredAt, house: event.house, events: [event], position });
    }
  }

  const entries: Array<TimelineEntry & { house: TimelineHouse }> = [
    ...items.map((item, position) => ({ kind: "movement" as const, occurredAt: item.occurredAt, item, position, house: item.house })),
    ...Array.from(voteMoments.values(), (moment) => ({ kind: "votes" as const, ...moment })),
  ];
  const newestFirst = entries
    .sort((left, right) => {
      const dateDifference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
      if (dateDifference) return dateDifference;
      if (left.kind !== right.kind) return left.kind === "votes" ? -1 : 1;
      return right.position - left.position;
    });
  const grouped = new Map<TimelineHouse, TimelineGroup>();

  for (const entry of newestFirst) {
    const group = grouped.get(entry.house) ?? {
      house: entry.house,
      entries: [],
      movementCount: 0,
      voteCount: 0,
    };
    group.entries.push(entry);
    if (entry.kind === "movement") group.movementCount += 1;
    else group.voteCount += entry.events.length;
    grouped.set(entry.house, group);
  }

  return Array.from(grouped.values());
}

const FRIENDLY_BODY_NAMES: Readonly<Record<string, string>> = {
  CCP: "Coordenação de Comissões Permanentes",
  CSAUDE: "Comissão de Saúde",
  MESA: "Mesa Diretora",
  PLEN: "Plenário da Câmara dos Deputados",
};

function friendlyBodyName(bodyName: string) {
  const officialCode = bodyName.trim().toUpperCase();
  if (FRIENDLY_BODY_NAMES[officialCode]) {
    return FRIENDLY_BODY_NAMES[officialCode];
  }
  if (/^[A-Z0-9_-]{2,16}$/.test(officialCode)) {
    return `Nome não disponível · código oficial ${officialCode}`;
  }
  return bodyName;
}

const MOVEMENT_RULES: ReadonlyArray<{
  matches: RegExp;
  movement: (item: PublicTimelineItem) => PlainMovement;
}> = [
  {
    matches: /prazo para emendas|prazo.*apresenta.*emenda/,
    movement: () => ({
      title: "Prazo aberto para alterações",
      explanation: "Foi aberto um período para parlamentares sugerirem mudanças no texto do projeto.",
    }),
  },
  {
    matches: /designad[oa].*relator|relator.*designad[oa]/,
    movement: () => ({
      title: "Relator definido",
      explanation: "Foi escolhida a pessoa parlamentar responsável por analisar o projeto e preparar um parecer.",
    }),
  },
  {
    matches: /recebimento|recebid[oa]/,
    movement: (item) => ({
      title: "Projeto recebido pelo órgão responsável",
      explanation: item.bodyName
        ? `${friendlyBodyName(item.bodyName)} recebeu o projeto para dar continuidade à análise.`
        : "O órgão responsável recebeu o projeto para dar continuidade à análise.",
    }),
  },
  {
    matches: /encaminhad[oa].*publica|publicacao inicial|publicad[oa].*(?:diario|avulso)/,
    movement: () => ({
      title: "Texto publicado oficialmente",
      explanation: "O conteúdo do projeto foi disponibilizado nos registros oficiais para consulta pública.",
    }),
  },
  {
    matches: /(?:as|encaminhad[oa].*?) comiss|distribuid[oa].*comiss/,
    movement: () => ({
      title: "Projeto enviado para análise das comissões",
      explanation: "A proposta foi encaminhada aos grupos de parlamentares responsáveis por analisar o tema.",
    }),
  },
  {
    matches: /apresentacao d|projeto.*apresentad[oa]|protocolad[oa]/,
    movement: () => ({
      title: "Projeto apresentado",
      explanation: "A proposta foi registrada oficialmente e entrou em tramitação.",
    }),
  },
  {
    matches: /parecer.*(?:aprovad|rejeitad)|(?:aprovad|rejeitad).*parecer/,
    movement: () => ({
      title: "Parecer analisado",
      explanation: "Os parlamentares decidiram sobre a análise preparada pelo relator do projeto.",
    }),
  },
  {
    matches: /votacao|votad[oa]|deliberacao/,
    movement: () => ({
      title: "Projeto levado a votação",
      explanation: "Os parlamentares decidiram sobre o projeto ou sobre uma parte de sua tramitação.",
    }),
  },
  {
    matches: /remetid[oa].*senado|enviad[oa].*senado/,
    movement: () => ({
      title: "Projeto enviado ao Senado",
      explanation: "A análise na Câmara avançou e o projeto foi encaminhado para tramitar no Senado.",
    }),
  },
  {
    matches: /remetid[oa].*camara|enviad[oa].*camara/,
    movement: () => ({
      title: "Projeto enviado à Câmara",
      explanation: "A análise no Senado avançou e o projeto foi encaminhado para tramitar na Câmara.",
    }),
  },
  {
    matches: /sancao|presidencia da republica/,
    movement: () => ({
      title: "Projeto enviado à Presidência",
      explanation: "Depois da análise no Congresso, o texto seguiu para sanção ou veto presidencial.",
    }),
  },
  {
    matches: /transformad[oa].*lei|convertid[oa].*lei|promulgad[oa]/,
    movement: () => ({
      title: "Projeto transformado em norma",
      explanation: "A proposta concluiu a tramitação e foi convertida em uma norma oficial.",
    }),
  },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function ResponsibleBody({ bodyName }: Readonly<{ bodyName: string | null }>) {
  if (!bodyName) {
    return null;
  }

  return (
    <div className="timeline__responsible">
      <b>Órgão responsável</b>
      <span>{friendlyBodyName(bodyName)}</span>
    </div>
  );
}

function simplifyMovement(item: PublicTimelineItem): PlainMovement {
  const description = normalize(item.description);
  return MOVEMENT_RULES.find((rule) => rule.matches.test(description))?.movement(item) ?? {
    title: "Movimentação registrada",
    explanation: "A fonte oficial registrou uma atualização nesta etapa. Abra a visão detalhada para ler o conteúdo completo.",
  };
}

function explainNextStep(statusLabel: string | null) {
  const status = normalize(statusLabel ?? "");

  if (/aguardando parecer/.test(status)) {
    return "Agora, o relator precisa apresentar sua análise antes que o projeto possa avançar.";
  }
  if (/aguardando.*relator/.test(status)) {
    return "Agora, precisa ser escolhido um relator para analisar o projeto.";
  }
  if (/aguardando encaminhamento/.test(status)) {
    return "Agora, o órgão responsável precisa encaminhar o projeto para a próxima parte da tramitação.";
  }
  if (/pront[oa].*(?:pauta|vota)|aguardando.*(?:vota|delibera)/.test(status)) {
    return "Agora, o projeto aguarda ser incluído na pauta e analisado pelos parlamentares.";
  }
  if (statusLabel) {
    return `A situação oficial atual é “${statusLabel}”. Novas movimentações indicarão o próximo avanço.`;
  }
  return "A próxima atualização depende de uma nova movimentação publicada pela fonte oficial.";
}

function simplifyVoteTitle(description: string) {
  const text = normalize(description);

  if (/redacao final/.test(text)) return "Votação da redação final";
  if (/urgencia/.test(text)) return "Votação do pedido de urgência";
  if (/subemenda|substitutiv|texto do projeto|projeto de lei|proposta/.test(text)) return "Votação do texto do projeto";
  if (/requerimento/.test(text)) return "Votação de um requerimento";
  if (/parecer/.test(text)) return "Votação do parecer";
  return "Votação registrada";
}

function voteTally(description: string) {
  const text = normalize(description);
  const tally: string[] = [];
  const choices: ReadonlyArray<[string, RegExp]> = [
    ["sim", /\bsim\s*[:–-]\s*(\d+)/],
    ["não", /\bnao\s*[:–-]\s*(\d+)/],
    ["abstenção", /\babstencao\s*[:–-]\s*(\d+)/],
  ];

  for (const [label, pattern] of choices) {
    const count = text.match(pattern)?.[1];
    if (count) tally.push(`${count} ${label}`);
  }

  return tally.join(" · ");
}

function timelineGroupCount(group: TimelineGroup) {
  const movements = `${group.movementCount} ${group.movementCount === 1 ? "movimentação" : "movimentações"}`;
  const votes = `${group.voteCount} ${group.voteCount === 1 ? "votação" : "votações"}`;
  return group.voteCount ? `${movements} · ${votes}` : movements;
}

function VoteMoment({ detailed, events }: Readonly<{ detailed: boolean; events: PublicVoteEvent[] }>) {
  const firstEvent = events[0];
  if (!firstEvent) return null;

  return (
    <li className="timeline__item timeline__item--vote">
      <span className="timeline__station timeline__station--vote" aria-hidden="true" />
      <div className="timeline__date">
        <time dateTime={firstEvent.occurredAt}>{formatDateTime(firstEvent.occurredAt)}</time>
        <span>Data informada pela fonte</span>
      </div>
      <div className="timeline__body timelineVote">
        <span className="timelineVote__badge">{houseLabel(firstEvent.house)} · Votação</span>
        <strong>{events.length === 1 ? simplifyVoteTitle(firstEvent.description) : `${events.length} votações registradas neste momento`}</strong>
        <div className="timelineVote__events">
          {events.map((event) => {
            const tally = voteTally(event.description);

            return (
              <div className="timelineVote__event" key={`${event.house}-${event.externalId}`}>
                {events.length > 1 ? <b>{simplifyVoteTitle(event.description)}</b> : null}
                <span className="timelineVote__result">Resultado: <strong>{event.result ?? "Não informado"}</strong></span>
                {tally ? <p className="timelineVote__tally">{tally}</p> : null}
                {detailed ? <p className="timelineVote__officialText">{event.description}</p> : null}
                <a href={`#${voteEventAnchorId(event)}`}>Ver votação completa</a>
              </div>
            );
          })}
        </div>
      </div>
    </li>
  );
}

function Movement({ detailed, isCurrent, item }: Readonly<{
  detailed: boolean;
  isCurrent: boolean;
  item: PublicTimelineItem;
}>) {
  const simplified = simplifyMovement(item);

  if (detailed) {
    return (
      <li className={isCurrent ? "timeline__item timeline__item--current" : "timeline__item"}>
        <span className="timeline__station" aria-hidden="true" />
        <div className="timeline__date"><time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time><span>{houseLabel(item.house)}</span></div>
        <div className="timeline__body">
          {isCurrent ? <span className="timeline__currentLabel">Etapa atual</span> : null}
          {item.statusLabel ? (
            <div className="timeline__officialStatus">
              <span>Situação registrada nesse momento</span>
              <strong>{item.statusLabel}</strong>
            </div>
          ) : null}
          <p>{item.description}</p>
          <ResponsibleBody bodyName={item.bodyName} />
          <div className="timeline__meta">
            <a href={item.officialUrl} rel="noreferrer" target="_blank">Registro oficial <ExternalIcon /></a>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className={isCurrent ? "timeline__item timeline__item--current" : "timeline__item timeline__item--complete"}>
      <span className="timeline__station" aria-hidden="true" />
      <div className="timeline__date"><time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time><span>{houseLabel(item.house)}</span></div>
      <div className="timeline__body">
        <span className={isCurrent ? "timeline__state timeline__state--current" : "timeline__state timeline__state--complete"}>
          {isCurrent ? "Etapa atual" : "Concluída"}
        </span>
        <strong>{simplified.title}</strong>
        <p>{simplified.explanation}</p>
        {isCurrent ? (
          <div className="timeline__nextStep">
            <b>O que acontece agora</b>
            <span>{explainNextStep(item.statusLabel)}</span>
          </div>
        ) : null}
        <ResponsibleBody bodyName={item.bodyName} />
      </div>
    </li>
  );
}

function ViewSelector({ view, onChange }: Readonly<{ view: TimelineView; onChange: (view: TimelineView) => void }>) {
  return (
    <div aria-label="Modo de visualização da tramitação" className="timelineViewSelector" role="tablist">
      <button
        aria-controls="timeline-simple-panel"
        aria-selected={view === "simple"}
        className={view === "simple" ? "timelineViewSelector__button timelineViewSelector__button--active" : "timelineViewSelector__button"}
        id="timeline-simple-tab"
        onClick={() => onChange("simple")}
        role="tab"
        type="button"
      >
        Visão simplificada
      </button>
      <button
        aria-controls="timeline-detailed-panel"
        aria-selected={view === "detailed"}
        className={view === "detailed" ? "timelineViewSelector__button timelineViewSelector__button--active" : "timelineViewSelector__button"}
        id="timeline-detailed-tab"
        onClick={() => onChange("detailed")}
        role="tab"
        type="button"
      >
        Visão detalhada
      </button>
    </div>
  );
}

function TimelineContent({ detailed, items, voteEvents }: Readonly<{
  detailed: boolean;
  items: PublicTimelineItem[];
  voteEvents: PublicVoteEvent[];
}>) {
  const currentItem = items.at(-1);
  const panel = detailed ? "detailed" : "simple";

  return (
    <div aria-labelledby={`timeline-${panel}-tab`} id={`timeline-${panel}-panel`} role="tabpanel">
      <p className="timelineViewIntro">
        {detailed
          ? "Veja os registros completos exatamente como foram publicados pela fonte oficial. As votações aparecem no momento informado pela fonte."
          : "Entenda os principais acontecimentos sem termos técnicos. As votações aparecem na ordem em que aconteceram, junto das demais movimentações oficiais."}
      </p>
      <div className="timelineHouses">
        {timelineGroups(items, voteEvents).map((group) => (
          <section aria-label={timelineHouseTitle(group.house)} className={`timelineHouse timelineHouse--${group.house}`} key={group.house}>
            <header className="timelineHouse__header">
              <span>{houseLabel(group.house)}</span>
              <h3>{timelineHouseTitle(group.house)}</h3>
              <p>{timelineGroupCount(group)}</p>
            </header>
            <ol className={`timeline timeline--${panel}`}>
              {group.entries.map((entry) => entry.kind === "votes" ? (
                <VoteMoment detailed={detailed} events={entry.events} key={`votes-${group.house}-${entry.occurredAt}`} />
              ) : (
                <Movement
                  detailed={detailed}
                  isCurrent={entry.item === currentItem}
                  item={entry.item}
                  key={`${entry.item.source}-${entry.item.externalId}`}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

export function ProjectTimeline({ items, voteEvents = [] }: Readonly<{
  items: PublicTimelineItem[];
  voteEvents?: PublicVoteEvent[];
}>) {
  const [view, setView] = useState<TimelineView>("simple");

  if (items.length === 0 && voteEvents.length === 0) {
    return <p className="sectionEmpty">A fonte oficial ainda não publicou movimentações detalhadas para esta matéria.</p>;
  }

  return (
    <div className="timelineExplorer">
      <ViewSelector onChange={setView} view={view} />
      <TimelineContent detailed={view === "detailed"} items={items} voteEvents={voteEvents} />
    </div>
  );
}
