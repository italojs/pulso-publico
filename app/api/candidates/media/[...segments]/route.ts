import { Readable } from "node:stream";
import type { ReadStream } from "node:fs";

import { ElectoralMediaStore } from "#/integrations/tse/media-store";
import {
  resolveCandidateMediaAsset as resolveDatabaseAsset,
  type CandidateMediaAsset,
} from "#/server/candidates/queries";
import { env } from "#/server/config";
import { db } from "#/server/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const mediaStore = new ElectoralMediaStore(env.ELECTORAL_MEDIA_DIRECTORY);
const notFoundHeaders = { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" };

type RouteContext = { params: Promise<{ segments: string[] }> };

export interface CandidateMediaDependencies {
  resolveAsset(segments: readonly string[]): Promise<CandidateMediaAsset | null>;
  openAsset(storageKey: string): ReadStream;
}

function safeFilename(value: string, mimeType: CandidateMediaAsset["mimeType"]): string {
  const extension = mimeType === "image/jpeg" ? ".jpg" : ".pdf";
  const cleaned = value.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"\\/]/g, "_")
    .trim()
    .slice(0, 160);
  return cleaned.length > 0 && cleaned.toLocaleLowerCase("pt-BR").endsWith(extension)
    ? cleaned
    : `documento-oficial${extension}`;
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
      if (asset.mimeType !== "image/jpeg" && asset.mimeType !== "application/pdf") return notFound();
      const stream = dependencies.openAsset(asset.storageKey);
      const headers = new Headers({
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Type": asset.mimeType,
        "X-Content-Type-Options": "nosniff",
      });
      if (asset.mimeType === "application/pdf") {
        const filename = safeFilename(asset.originalFilename, asset.mimeType);
        headers.set(
          "Content-Disposition",
          `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        );
      }
      return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { headers });
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
  openAsset: (storageKey) => mediaStore.open(storageKey),
});
