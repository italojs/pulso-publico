import { Buffer } from "node:buffer";
import { Readable, Transform, Writable, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { Entry } from "unzipper";
import { Parse } from "unzipper";

import { TseContractError } from "#/integrations/tse/mapper";

export interface ArchiveByteCounter {
  bytes: number;
  readonly maximum: number;
  readonly errorCode: string;
}

export function assertSafeArchivePath(entryPath: string): void {
  if (
    entryPath.length === 0
    || entryPath.includes("\0")
    || entryPath.startsWith("/")
    || entryPath.startsWith("\\")
    || /^[a-zA-Z]:[\\/]/.test(entryPath)
    || entryPath.split(/[\\/]/).some((part) => part === "..")
  ) {
    throw new TseContractError("UNSAFE_ARCHIVE_ENTRY");
  }
}

export async function* streamZipEntries(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<Entry> {
  const source = Readable.fromWeb(
    body as Parameters<typeof Readable.fromWeb>[0],
    { signal },
  );
  const parser = Parse({ forceStream: true });
  source.once("error", (error) => parser.destroy(error));
  source.pipe(parser);

  try {
    for await (const value of parser) {
      yield value as Entry;
    }
  } catch (error) {
    if (signal.aborted) throw new TseContractError("TSE_REQUEST_ABORTED");
    if (error instanceof TseContractError) throw error;
    throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
  } finally {
    source.destroy();
    parser.destroy();
  }
}

export function limitedBytes(
  entryMaximum: number,
  total?: ArchiveByteCounter,
): Transform {
  let entryBytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      entryBytes += chunk.byteLength;
      if (entryBytes > entryMaximum) {
        callback(new TseContractError("ARCHIVE_ENTRY_TOO_LARGE"));
        return;
      }
      if (total) {
        total.bytes += chunk.byteLength;
        if (total.bytes > total.maximum) {
          callback(new TseContractError(total.errorCode));
          return;
        }
      }
      callback(null, chunk);
    },
  });
}

export function assertDeclaredEntrySize(
  entry: Entry,
  entryMaximum: number,
  total?: ArchiveByteCounter,
): void {
  const declaredSize = declaredUncompressedSize(entry);
  if (
    declaredSize !== undefined
    && (
      declaredSize > entryMaximum
      || (total !== undefined && total.bytes + declaredSize > total.maximum)
    )
  ) {
    entry.destroy();
    throw new TseContractError(
      declaredSize > entryMaximum ? "ARCHIVE_ENTRY_TOO_LARGE" : total!.errorCode,
    );
  }
}

export async function drainBoundedArchiveEntry(
  entry: Entry,
  entryMaximum: number,
  signal: AbortSignal,
  total?: ArchiveByteCounter,
): Promise<void> {
  assertDeclaredEntrySize(entry, entryMaximum, total);
  try {
    await pipeline(
      entry,
      limitedBytes(entryMaximum, total),
      new Writable({ write(_chunk, _encoding, callback) { callback(); } }),
      { signal },
    );
  } catch (error) {
    if (signal.aborted) throw new TseContractError("TSE_REQUEST_ABORTED");
    if (error instanceof TseContractError) throw error;
    throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
  }
}

export function windows1252Decoder(): Transform {
  const decoder = new TextDecoder("windows-1252", { fatal: true });
  return new Transform({
    decodeStrings: true,
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      try {
        callback(null, decoder.decode(chunk, { stream: true }));
      } catch {
        callback(new TseContractError("INVALID_TSE_ENCODING"));
      }
    },
    flush(callback: TransformCallback) {
      try {
        callback(null, decoder.decode());
      } catch {
        callback(new TseContractError("INVALID_TSE_ENCODING"));
      }
    },
  });
}

export function declaredUncompressedSize(entry: Entry): number | undefined {
  const value = (entry.vars as Entry["vars"] & { uncompressedSize?: number }).uncompressedSize;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
