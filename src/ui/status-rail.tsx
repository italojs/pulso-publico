import type { LegislativeSourceName } from "#/domain/legislative";

export function StatusRail({
  status,
  source,
  compact = false,
}: Readonly<{ status: string; source: LegislativeSourceName; compact?: boolean }>) {
  return (
    <div className={`statusRail statusRail--${source}${compact ? " statusRail--compact" : ""}`}>
      <span className="statusRail__label">Situação oficial</span>
      <strong className="statusRail__value">{status}</strong>
    </div>
  );
}
