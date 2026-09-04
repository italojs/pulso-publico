import type { LegislativeSourceName } from "#/domain/legislative";
import { sourceLabel } from "#/ui/format";

export function SourceBadge({ source }: Readonly<{ source: LegislativeSourceName }>) {
  return (
    <span className={`sourceBadge sourceBadge--${source}`}>
      <span className="sourceBadge__dot" />
      {sourceLabel(source)}
    </span>
  );
}
