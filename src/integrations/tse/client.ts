import { Buffer } from "node:buffer";
import { basename } from "node:path";
import { finished } from "node:stream/promises";
import { Readable } from "node:stream";

import { parse } from "csv-parse";
import type { Entry } from "unzipper";

import {
  assertSafeArchivePath,
  declaredUncompressedSize,
  drainArchiveEntry,
  limitedBytes,
  streamZipEntries,
  windows1252Decoder,
  type ArchiveByteCounter,
} from "#/integrations/tse/archive-reader";
import { TseContractError } from "#/integrations/tse/mapper";

export const TSE_RESOURCES = {
  candidates: "estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
  complements: "estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip",
  assets: "estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip",
  coalitions: "estatistica/sead/odsele/consulta_coligacao/consulta_coligacao_2026.zip",
  social: "estatistica/sead/odsele/consulta_cand/rede_social_candidato_2026.zip",
  campaignAccounts: "estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip",
} as const;

export const TSE_REGIONS = [
  "BR",
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;

export type TseRegion = typeof TSE_REGIONS[number];

export const TSE_REGIONAL_MEDIA = {
  photos: (region: TseRegion) => `estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_${region}_div.zip`,
  governmentPlans: (region: TseRegion) => `estatistica/sead/odsele/proposta_governo/proposta_governo_2026_${region}.zip`,
  certificates: (region: TseRegion) => `estatistica/sead/odsele/certidao_criminal/certidao_criminal_2026_${region}.zip`,
} as const;

export type TseResourceName = keyof typeof TSE_RESOURCES;
export type TseRegionalMediaKind = keyof typeof TSE_REGIONAL_MEDIA;
export type TseRow = Record<string, string>;

export interface TseMediaEntry {
  readonly kind: TseRegionalMediaKind;
  readonly region: TseRegion;
  readonly candidateExternalId: string;
  readonly originalFilename: string;
  readonly mimeType: "image/jpeg" | "application/pdf";
  readonly sourceArchiveUrl: string;
  readonly content: Readable;
}

interface TseClientLimits {
  readonly tabularEntryBytes: number;
  readonly mediaEntryBytes: number;
  readonly mediaArchiveBytes: number;
}

interface TseOpenDataClientOptions {
  readonly fetch?: typeof fetch;
  readonly baseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly limits?: Partial<TseClientLimits>;
}

const DEFAULT_LIMITS: TseClientLimits = {
  tabularEntryBytes: 512 * 1024 * 1024,
  mediaEntryBytes: 25 * 1024 * 1024,
  mediaArchiveBytes: 2 * 1024 * 1024 * 1024,
};

const ZIP_CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "binary/octet-stream",
]);

const expectedTabularEntry: Record<TseResourceName, RegExp> = {
  candidates: /^consulta_cand_2026_(?:brasil|br|[a-z]{2})\.(?:csv|txt)$/i,
  complements: /^consulta_cand_complementar_2026_(?:brasil|br|[a-z]{2})\.(?:csv|txt)$/i,
  assets: /^bem_candidato_2026_(?:brasil|br|[a-z]{2})\.(?:csv|txt)$/i,
  coalitions: /^consulta_coligacao_2026_(?:brasil|br|[a-z]{2})\.(?:csv|txt)$/i,
  social: /^rede_social_candidato_2026_(?:brasil|br|[a-z]{2})\.(?:csv|txt)$/i,
  campaignAccounts: /^(?:(?:receitas|despesas|prestacao).*candidat.*2026|2026.*candidat.*(?:receitas|despesas|prestacao)).*\.(?:csv|txt)$/i,
};

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

function positiveLimit(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TseContractError(code);
  return value;
}

function assertOfficialUrl(url: URL, errorCode = "UNSAFE_ARCHIVE_REDIRECT"): void {
  if (
    url.protocol !== "https:"
    || url.hostname !== "cdn.tse.jus.br"
    || url.username.length > 0
    || url.password.length > 0
  ) {
    throw new TseContractError(errorCode);
  }
}

function isTseRegion(value: string): value is TseRegion {
  return (TSE_REGIONS as readonly string[]).includes(value);
}

function mediaContract(kind: TseRegionalMediaKind): {
  extension: RegExp;
  mimeType: TseMediaEntry["mimeType"];
  magic: readonly number[];
} {
  if (kind === "photos") {
    return { extension: /\.jpe?g$/i, mimeType: "image/jpeg", magic: [0xff, 0xd8, 0xff] };
  }
  return {
    extension: /\.pdf$/i,
    mimeType: "application/pdf",
    magic: [...Buffer.from("%PDF-")],
  };
}

export function parseCandidateExternalId(filename: string): string {
  const identifiers = [...filename.matchAll(/(?<!\d)(\d{12})(?!\d)/g)].map((match) => match[1]!);
  if (identifiers.length !== 1) throw new TseContractError("INVALID_MEDIA_CANDIDATE_ID");
  return identifiers[0]!;
}

async function prepareMediaContent(
  entry: Entry,
  magic: readonly number[],
  entryMaximum: number,
  total: ArchiveByteCounter,
): Promise<Readable> {
  const declaredSize = declaredUncompressedSize(entry);
  if (declaredSize !== undefined && declaredSize > entryMaximum) {
    await drainArchiveEntry(entry);
    throw new TseContractError("ARCHIVE_ENTRY_TOO_LARGE");
  }

  const bounded = entry.pipe(limitedBytes(entry, entryMaximum, total));
  const iterator = bounded[Symbol.asyncIterator]();
  const prefixChunks: Buffer[] = [];
  let prefixLength = 0;

  while (prefixLength < magic.length) {
    const result = await iterator.next();
    if (result.done) break;
    const chunk = Buffer.from(result.value);
    prefixChunks.push(chunk);
    prefixLength += chunk.byteLength;
  }

  const prefix = Buffer.concat(prefixChunks);
  if (prefix.length < magic.length || magic.some((byte, index) => prefix[index] !== byte)) {
    entry.destroy();
    throw new TseContractError("INVALID_MEDIA_FORMAT");
  }

  return Readable.from((async function* () {
    yield prefix;
    while (true) {
      const result = await iterator.next();
      if (result.done) return;
      yield result.value;
    }
  })());
}

export class TseOpenDataClient {
  readonly #fetch: typeof fetch;
  readonly #baseUrl: URL;
  readonly #requestTimeoutMs: number;
  readonly #limits: TseClientLimits;

  constructor(options: TseOpenDataClientOptions = {}) {
    this.#fetch = options.fetch ?? fetch;
    this.#baseUrl = new URL(options.baseUrl ?? "https://cdn.tse.jus.br/");
    assertOfficialUrl(this.#baseUrl, "INVALID_TSE_BASE_URL");
    this.#requestTimeoutMs = positiveLimit(options.requestTimeoutMs ?? 120_000, "INVALID_REQUEST_TIMEOUT");
    this.#limits = {
      tabularEntryBytes: positiveLimit(
        options.limits?.tabularEntryBytes ?? DEFAULT_LIMITS.tabularEntryBytes,
        "INVALID_TABULAR_ENTRY_LIMIT",
      ),
      mediaEntryBytes: positiveLimit(
        options.limits?.mediaEntryBytes ?? DEFAULT_LIMITS.mediaEntryBytes,
        "INVALID_MEDIA_ENTRY_LIMIT",
      ),
      mediaArchiveBytes: positiveLimit(
        options.limits?.mediaArchiveBytes ?? DEFAULT_LIMITS.mediaArchiveBytes,
        "INVALID_MEDIA_ARCHIVE_LIMIT",
      ),
    };
  }

  async *streamRows(
    resource: TseResourceName,
    signal?: AbortSignal,
  ): AsyncGenerator<TseRow> {
    const path = TSE_RESOURCES[resource];
    if (!path) throw new TseContractError("UNKNOWN_TSE_RESOURCE");
    const request = await this.#requestArchive(path, signal);
    let foundExpectedEntry = false;

    for await (const entry of streamZipEntries(request.body, request.signal)) {
      assertSafeArchivePath(entry.path);
      if (entry.type === "Directory") {
        await drainArchiveEntry(entry);
        continue;
      }
      const filename = basename(entry.path.replaceAll("\\", "/"));
      if (!expectedTabularEntry[resource].test(filename)) {
        await drainArchiveEntry(entry);
        continue;
      }
      foundExpectedEntry = true;
      const declaredSize = declaredUncompressedSize(entry);
      if (declaredSize !== undefined && declaredSize > this.#limits.tabularEntryBytes) {
        await drainArchiveEntry(entry);
        throw new TseContractError("ARCHIVE_ENTRY_TOO_LARGE");
      }

      const parser = entry
        .pipe(limitedBytes(entry, this.#limits.tabularEntryBytes))
        .pipe(windows1252Decoder())
        .pipe(parse({
          bom: true,
          columns: true,
          delimiter: ";",
          skip_empty_lines: true,
        }));
      try {
        for await (const row of parser) yield row as TseRow;
      } catch (error) {
        if (error instanceof TseContractError) throw error;
        throw new TseContractError("INVALID_TABULAR_RESOURCE");
      }
    }

    if (!foundExpectedEntry) throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
  }

  async *streamRegionalMedia(
    kind: TseRegionalMediaKind,
    region: TseRegion,
    signal?: AbortSignal,
  ): AsyncGenerator<TseMediaEntry> {
    const pathFactory = TSE_REGIONAL_MEDIA[kind];
    if (!pathFactory) throw new TseContractError("UNKNOWN_TSE_MEDIA_KIND");
    if (!isTseRegion(region)) throw new TseContractError("INVALID_TSE_REGION");
    const request = await this.#requestArchive(pathFactory(region), signal);
    const contract = mediaContract(kind);
    const total: ArchiveByteCounter = {
      bytes: 0,
      maximum: this.#limits.mediaArchiveBytes,
      errorCode: "ARCHIVE_TOTAL_TOO_LARGE",
    };
    let foundExpectedEntry = false;

    for await (const entry of streamZipEntries(request.body, request.signal)) {
      assertSafeArchivePath(entry.path);
      if (entry.type === "Directory") {
        await drainArchiveEntry(entry);
        continue;
      }
      const originalFilename = basename(entry.path.replaceAll("\\", "/"));
      if (!contract.extension.test(originalFilename)) {
        await drainArchiveEntry(entry);
        throw new TseContractError("INVALID_MEDIA_FORMAT");
      }
      const candidateExternalId = parseCandidateExternalId(originalFilename);
      const content = await prepareMediaContent(
        entry,
        contract.magic,
        this.#limits.mediaEntryBytes,
        total,
      );
      foundExpectedEntry = true;
      yield {
        kind,
        region,
        candidateExternalId,
        originalFilename,
        mimeType: contract.mimeType,
        sourceArchiveUrl: request.url,
        content,
      };
      await finished(content);
    }

    if (!foundExpectedEntry) throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
  }

  async #requestArchive(
    path: string,
    callerSignal?: AbortSignal,
  ): Promise<{ body: ReadableStream<Uint8Array>; signal: AbortSignal; url: string }> {
    const timeoutSignal = AbortSignal.timeout(this.#requestTimeoutMs);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutSignal])
      : timeoutSignal;
    let url = new URL(path, this.#baseUrl);
    assertOfficialUrl(url);

    for (let redirects = 0; redirects <= 3; redirects += 1) {
      let response: Response;
      try {
        response = await this.#fetch(url, {
          headers: { "User-Agent": "Pulso-Publico-Electoral-Sync/2026" },
          redirect: "manual",
          signal,
        });
      } catch (error) {
        if (signal.aborted) throw new TseContractError("TSE_REQUEST_ABORTED");
        throw error;
      }

      if (response.url) assertOfficialUrl(new URL(response.url));
      if (redirectStatuses.has(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
        url = new URL(location, url);
        assertOfficialUrl(url);
        continue;
      }
      if (!response.ok || !response.body) throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (!contentType || !ZIP_CONTENT_TYPES.has(contentType)) {
        await response.body.cancel();
        throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
      }
      return { body: response.body, signal, url: url.toString() };
    }
    throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
  }
}
