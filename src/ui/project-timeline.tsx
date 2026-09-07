"use client";

import { useState } from "react";

import type { PublicTimelineItem } from "#/server/public/read-models";
import { formatDateTime, houseLabel } from "#/ui/format";
import { ExternalIcon } from "#/ui/icons";

type TimelineView = "simple" | "detailed";
type TimelineHouse = PublicTimelineItem["house"];

interface PlainMovement {
  title: string;
  explanation: string;
}

const TIMELINE_HOUSES: readonly TimelineHouse[] = ["camara", "senado", "congresso"];

function timelineHouseTitle(house: TimelineHouse) {
  if (house === "camara") return "Tramitação na Câmara";
  if (house === "senado") return "Tramitação no Senado";
  return "Tramitação no Congresso Nacional";
}

function timelineGroups(items: PublicTimelineItem[]) {
  const grouped = new Map<TimelineHouse, PublicTimelineItem[]>();
  for (const item of items) {
    const houseItems = grouped.get(item.house) ?? [];
    houseItems.push(item);
    grouped.set(item.house, houseItems);
  }
  return TIMELINE_HOUSES.flatMap((house) => {
    const houseItems = grouped.get(house) ?? [];
    return houseItems.length > 0 ? [{ house, items: houseItems }] : [];
  });
}

const FRIENDLY_BODY_NAMES: Readonly<Record<string, string>> = {
  CCP: "Coordenação de Comissões Permanentes",
  CSAUDE: "Comissão de Saúde",
  MESA: "Mesa Diretora",
};

function friendlyBodyName(bodyName: string) {
  const officialCode = bodyName.trim().toUpperCase();
  if (FRIENDLY_BODY_NAMES[officialCode]) {
    return FRIENDLY_BODY_NAMES[officialCode];
  }
  if (/^[A-Z0-9_-]{2,16}$/.test(officialCode)) {
    return officialCode.startsWith("C") ? "Comissão responsável" : "Órgão responsável";
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

function SimpleTimeline({ items }: Readonly<{ items: PublicTimelineItem[] }>) {
  const currentItem = items.at(-1);

  return (
    <div aria-labelledby="timeline-simple-tab" id="timeline-simple-panel" role="tabpanel">
      <p className="timelineViewIntro">Entenda os principais acontecimentos sem termos técnicos. As explicações abaixo são criadas por regras, a partir dos registros oficiais.</p>
      <div className="timelineHouses">
        {timelineGroups(items).map((group) => (
          <section aria-label={timelineHouseTitle(group.house)} className={`timelineHouse timelineHouse--${group.house}`} key={group.house}>
            <header className="timelineHouse__header">
              <span>{houseLabel(group.house)}</span>
              <h3>{timelineHouseTitle(group.house)}</h3>
              <p>{group.items.length} {group.items.length === 1 ? "movimentação" : "movimentações"}</p>
            </header>
            <ol className="timeline timeline--simple">
              {[...group.items].reverse().map((item) => {
                const isCurrent = item === currentItem;
                const simplified = simplifyMovement(item);

                return (
                  <li className={isCurrent ? "timeline__item timeline__item--current" : "timeline__item timeline__item--complete"} key={`${item.source}-${item.externalId}`}>
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
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

function DetailedTimeline({ items }: Readonly<{ items: PublicTimelineItem[] }>) {
  const currentItem = items.at(-1);

  return (
    <div aria-labelledby="timeline-detailed-tab" id="timeline-detailed-panel" role="tabpanel">
      <p className="timelineViewIntro">Veja os registros completos exatamente como foram publicados pela fonte oficial.</p>
      <div className="timelineHouses">
        {timelineGroups(items).map((group) => (
          <section aria-label={timelineHouseTitle(group.house)} className={`timelineHouse timelineHouse--${group.house}`} key={group.house}>
            <header className="timelineHouse__header">
              <span>{houseLabel(group.house)}</span>
              <h3>{timelineHouseTitle(group.house)}</h3>
              <p>{group.items.length} {group.items.length === 1 ? "movimentação" : "movimentações"}</p>
            </header>
            <ol className="timeline timeline--detailed">
              {[...group.items].reverse().map((item) => (
                <li className={item === currentItem ? "timeline__item timeline__item--current" : "timeline__item"} key={`${item.source}-${item.externalId}`}>
                  <span className="timeline__station" aria-hidden="true" />
                  <div className="timeline__date"><time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time><span>{houseLabel(item.house)}</span></div>
                  <div className="timeline__body">
                    {item === currentItem ? <span className="timeline__currentLabel">Etapa atual</span> : null}
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
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

export function ProjectTimeline({ items }: Readonly<{ items: PublicTimelineItem[] }>) {
  const [view, setView] = useState<TimelineView>("simple");

  if (items.length === 0) {
    return <p className="sectionEmpty">A fonte oficial ainda não publicou movimentações detalhadas para esta matéria.</p>;
  }

  return (
    <div className="timelineExplorer">
      <ViewSelector onChange={setView} view={view} />
      {view === "simple" ? <SimpleTimeline items={items} /> : <DetailedTimeline items={items} />}
    </div>
  );
}
