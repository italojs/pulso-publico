import {
  resolveCandidateMediaAsset as resolveDatabaseAsset,
  type CandidateMediaAsset,
} from "#/server/candidates/queries";
import { db } from "#/server/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFoundHeaders = { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" };

type RouteContext = { params: Promise<{ segments: string[] }> };

export interface CandidateMediaDependencies {
  resolveAsset(segments: readonly string[]): Promise<CandidateMediaAsset | null>;
}

function notFound(): Response {
  return new Response("Mídia não encontrada.", { status: 404, headers: notFoundHeaders });
}

function isNonRevealingNotFound(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | { code?: unknown }).code;
  return typeof code === "string" && [
    "ENOENT",
    "ENOTDIR",
    "ELOOP",
    "EACCES",
    "UNSAFE_STORAGE_PATH",
    "INVALID_MEDIA_FORMAT",
  ].includes(code);
}

export function createCandidateMediaHandler(dependencies: CandidateMediaDependencies) {
  return async function GET(_request: Request, context: RouteContext): Promise<Response> {
    try {
      const { segments } = await context.params;
      if (!Array.isArray(segments) || segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
        return notFound();
      }
      const asset = await dependencies.resolveAsset(segments);
      if (!asset) return notFound();
      if (asset.mimeType !== "image/jpeg") return notFound();
      const headers = new Headers({
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Type": asset.mimeType,
        "X-Content-Type-Options": "nosniff",
      });
      const body = new Uint8Array(asset.content).buffer;
      return new Response(body, { headers });
    } catch (error) {
      if (isNonRevealingNotFound(error)) return notFound();
      return new Response("Mídia temporariamente indisponível.", {
        status: 500,
        headers: notFoundHeaders,
      });
    }
  };
}

export const resolveCandidateMediaAsset = resolveDatabaseAsset;

export const GET = createCandidateMediaHandler({
  resolveAsset: (segments) => resolveDatabaseAsset(db, segments),
});
