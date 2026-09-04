import type { LegislativeSourceName } from "#/domain/legislative";

const FRESH_FOR_MS = 90 * 60 * 1_000;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export const dynamic = "force-dynamic";

export interface SourceHealthRow {
  source: LegislativeSourceName;
  lastSuccessAt: Date | null;
}

export type SourceHealthReader = () => Promise<readonly SourceHealthRow[]>;

export async function readSourceHealth(): Promise<SourceHealthRow[]> {
  const [{ db }, { sourceHealth }] = await Promise.all([
    import("#/server/db/client"),
    import("#/server/db/schema"),
  ]);
  return db
    .select({
      source: sourceHealth.source,
      lastSuccessAt: sourceHealth.lastSuccessAt,
    })
    .from(sourceHealth);
}

export function createHealthHandler(
  reader: SourceHealthReader,
  now: () => Date = () => new Date(),
) {
  return async function GET(_request?: Request) {
    try {
      const checkedAt = now();
      const rows = await reader();
      const bySource = new Map(rows.map((row) => [row.source, row.lastSuccessAt]));
      const sourceStatus = (source: LegislativeSourceName) => {
        const lastSuccessAt = bySource.get(source) ?? null;
        return {
          available:
            lastSuccessAt !== null
            && checkedAt.getTime() - lastSuccessAt.getTime() <= FRESH_FOR_MS,
          lastSuccessAt: lastSuccessAt?.toISOString() ?? null,
        };
      };
      const sources = {
        camara: sourceStatus("camara"),
        senado: sourceStatus("senado"),
      };

      return Response.json(
        {
          status: sources.camara.available && sources.senado.available
            ? "ok"
            : "degraded",
          sources,
        },
        { headers: NO_STORE_HEADERS },
      );
    } catch {
      return Response.json(
        { status: "unavailable", code: "HEALTH_READ_FAILED" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }
  };
}

export const GET = createHealthHandler(readSourceHealth);
