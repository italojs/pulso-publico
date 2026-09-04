import type { PublicTimelineItem } from "#/server/public/read-models";
import { formatDateTime, houseLabel } from "#/ui/format";
import { ExternalIcon } from "#/ui/icons";

export function ProjectTimeline({ items }: Readonly<{ items: PublicTimelineItem[] }>) {
  if (items.length === 0) {
    return <p className="sectionEmpty">A fonte oficial ainda não publicou movimentações detalhadas para esta matéria.</p>;
  }

  return (
    <ol className="timeline">
      {[...items].reverse().map((item, index) => (
        <li className={index === 0 ? "timeline__item timeline__item--current" : "timeline__item"} key={item.externalId}>
          <span className="timeline__station" aria-hidden="true" />
          <div className="timeline__date"><time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time><span>{houseLabel(item.house)}</span></div>
          <div className="timeline__body">
            {index === 0 ? <span className="timeline__currentLabel">Movimentação mais recente</span> : null}
            {item.statusLabel ? <strong>{item.statusLabel}</strong> : null}
            <p>{item.description}</p>
            <div className="timeline__meta">
              {item.bodyName ? <span>{item.bodyName}</span> : null}
              <a href={item.officialUrl} rel="noreferrer" target="_blank">Registro oficial <ExternalIcon /></a>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
