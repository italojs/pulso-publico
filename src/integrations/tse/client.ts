import { Buffer } from "node:buffer";
import { basename } from "node:path";
import { finished, pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { parse } from "csv-parse";
import type { Entry } from "unzipper";

import {
  assertSafeArchivePath,
  assertDeclaredEntrySize,
  drainBoundedArchiveEntry,
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
  readonly tabularRecordBytes: number;
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
  tabularRecordBytes: 1024 * 1024,
  mediaEntryBytes: 25 * 1024 * 1024,
  mediaArchiveBytes: 2 * 1024 * 1024 * 1024,
};

const ZIP_CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "binary/octet-stream",
]);

const regionSuffix = "(?:BRASIL|BR|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)";

const expectedTabularEntry: Record<TseResourceName, RegExp> = {
  candidates: new RegExp(`^consulta_cand_2026_${regionSuffix}\\.(?:csv|txt)$`, "i"),
  complements: new RegExp(`^consulta_cand_complementar_2026_${regionSuffix}\\.(?:csv|txt)$`, "i"),
  assets: new RegExp(`^bem_candidato_2026_${regionSuffix}\\.(?:csv|txt)$`, "i"),
  coalitions: new RegExp(`^consulta_coligacao_2026_${regionSuffix}\\.(?:csv|txt)$`, "i"),
  social: new RegExp(`^rede_social_candidato_2026_${regionSuffix}\\.(?:csv|txt)$`, "i"),
  campaignAccounts: new RegExp(`^(?:receitas_candidatos|despesas_contratadas_candidatos|despesas_pagas_candidatos)_2026_${regionSuffix}\\.(?:csv|txt)$`, "i"),
};

const requiredColumnGroups: Record<TseResourceName, readonly (readonly string[])[]> = {
  candidates: [
    ["ANO_ELEICAO", "AA_ELEICAO"], ["SQ_CANDIDATO"], ["NM_CANDIDATO"],
    ["NM_URNA_CANDIDATO"], ["NR_CANDIDATO"], ["DS_CARGO"], ["SG_UF"],
    ["SG_PARTIDO"], ["NR_PARTIDO"], ["DS_SITUACAO_CANDIDATURA"],
  ],
  complements: [["ANO_ELEICAO", "AA_ELEICAO"], ["SQ_CANDIDATO"]],
  assets: [
    ["ANO_ELEICAO", "AA_ELEICAO"], ["SQ_CANDIDATO"],
    ["DS_TIPO_BEM_CANDIDATO"], ["VR_BEM_CANDIDATO"],
  ],
  coalitions: [
    ["ANO_ELEICAO", "AA_ELEICAO"], ["SG_UF"], ["DS_CARGO"],
    ["SG_PARTIDO"], ["NM_COLIGACAO"],
  ],
  social: [
    ["ANO_ELEICAO", "AA_ELEICAO"], ["SQ_CANDIDATO"],
    ["DS_URL_REDE_SOCIAL", "DS_URL"],
  ],
  campaignAccounts: [["ANO_ELEICAO", "AA_ELEICAO"], ["SQ_CANDIDATO"]],
};

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

function positiveLimit(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TseContractError(code);
  return value;
}

function validateTabularHeaders(
  resource: TseResourceName,
  filename: string,
  rawHeaders: string[],
): string[] {
  const headers = rawHeaders.map((header) => header.trim());
  const headerSet = new Set(headers);
  if (
    headers.some((header) => header.length === 0)
    || headerSet.size !== headers.length
    || requiredColumnGroups[resource].some((alternatives) =>
      !alternatives.some((column) => headerSet.has(column))
    )
  ) {
    throw new TseContractError("INVALID_TABULAR_SCHEMA");
  }

  if (resource === "campaignAccounts") {
    const normalizedFilename = filename.toLocaleLowerCase("pt-BR");
    const valueColumns = normalizedFilename.startsWith("receitas_")
      ? ["VR_RECEITA", "VR_RECEITA_BRUTA"]
      : normalizedFilename.startsWith("despesas_contratadas_")
        ? ["VR_DESPESA_CONTRATADA"]
        : ["VR_PAGTO"];
    if (!valueColumns.some((column) => headerSet.has(column))) {
      throw new TseContractError("INVALID_TABULAR_SCHEMA");
    }
  }
  return headers;
}

function assertOfficialUrl(url: URL, errorCode = "UNSAFE_ARCHIVE_REDIRECT"): void {
  if (
    url.origin !== "https://cdn.tse.jus.br"
    || url.username.length > 0
    || url.password.length > 0
  ) {
    throw new TseContractError(errorCode);
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (!response.body || response.body.locked) return;
  await response.body.cancel().catch(() => undefined);
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
  signal: AbortSignal,
): Promise<Readable> {
  assertDeclaredEntrySize(entry, entryMaximum, total);
  const iterator = entry[Symbol.asyncIterator]();
  const prefixChunks: Buffer[] = [];
  let prefixLength = 0;
  let entryBytes = 0;

  const nextChunk = async (): Promise<IteratorResult<Buffer>> => {
    let result: IteratorResult<unknown>;
    try {
      result = await iterator.next();
    } catch (error) {
      if (signal.aborted) throw new TseContractError("TSE_REQUEST_ABORTED");
      if (error instanceof TseContractError) throw error;
      throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
    }
    if (result.done) return { done: true, value: undefined };
    const chunk = Buffer.from(result.value as Uint8Array);
    entryBytes += chunk.byteLength;
    total.bytes += chunk.byteLength;
    if (entryBytes > entryMaximum || total.bytes > total.maximum) {
      entry.destroy();
      throw new TseContractError(
        entryBytes > entryMaximum ? "ARCHIVE_ENTRY_TOO_LARGE" : total.errorCode,
      );
    }
    return { done: false, value: chunk };
  };

  while (prefixLength < magic.length) {
    const result = await nextChunk();
    if (result.done) break;
    const chunk = result.value;
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
      const result = await nextChunk();
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
    if (this.#baseUrl.pathname !== "/" || this.#baseUrl.search || this.#baseUrl.hash) {
      throw new TseContractError("INVALID_TSE_BASE_URL");
    }
    this.#requestTimeoutMs = positiveLimit(options.requestTimeoutMs ?? 120_000, "INVALID_REQUEST_TIMEOUT");
    this.#limits = {
      tabularEntryBytes: positiveLimit(
        options.limits?.tabularEntryBytes ?? DEFAULT_LIMITS.tabularEntryBytes,
        "INVALID_TABULAR_ENTRY_LIMIT",
      ),
      tabularRecordBytes: positiveLimit(
        options.limits?.tabularRecordBytes ?? DEFAULT_LIMITS.tabularRecordBytes,
        "INVALID_TABULAR_RECORD_LIMIT",
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
    const seenBasenames = new Set<string>();

    for await (const entry of streamZipEntries(request.body, request.signal)) {
      assertSafeArchivePath(entry.path);
      assertDeclaredEntrySize(entry, this.#limits.tabularEntryBytes);
      if (entry.type === "Directory") {
        await drainBoundedArchiveEntry(
          entry,
          this.#limits.tabularEntryBytes,
          request.signal,
        );
        continue;
      }
      const filename = basename(entry.path.replaceAll("\\", "/"));
      if (!expectedTabularEntry[resource].test(filename)) {
        await drainBoundedArchiveEntry(
          entry,
          this.#limits.tabularEntryBytes,
          request.signal,
        );
        continue;
      }
      const normalizedFilename = filename.toLocaleLowerCase("pt-BR");
      if (seenBasenames.has(normalizedFilename)) {
        entry.destroy();
        throw new TseContractError("DUPLICATE_ARCHIVE_ENTRY");
      }
      seenBasenames.add(normalizedFilename);
      foundExpectedEntry = true;

      const limiter = limitedBytes(this.#limits.tabularEntryBytes);
      const decoder = windows1252Decoder();
      const parser = parse({
        bom: true,
        columns: (headers: string[]) => validateTabularHeaders(resource, filename, headers),
        delimiter: ";",
        max_record_size: this.#limits.tabularRecordBytes,
        skip_empty_lines: true,
      });
      const completion = pipeline(entry, limiter, decoder, parser, { signal: request.signal });
      void completion.catch(() => undefined);
      try {
        for await (const row of parser) yield row as TseRow;
        await completion;
      } catch (error) {
        await completion.catch(() => undefined);
        if (request.signal.aborted) throw new TseContractError("TSE_REQUEST_ABORTED");
        if (error instanceof TseContractError) throw error;
        throw new TseContractError("INVALID_TABULAR_RESOURCE");
      } finally {
        parser.destroy();
        decoder.destroy();
        limiter.destroy();
        entry.destroy();
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
    const seenBasenames = new Set<string>();

    for await (const entry of streamZipEntries(request.body, request.signal)) {
      assertSafeArchivePath(entry.path);
      assertDeclaredEntrySize(entry, this.#limits.mediaEntryBytes, total);
      if (entry.type === "Directory") {
        await drainBoundedArchiveEntry(
          entry,
          this.#limits.mediaEntryBytes,
          request.signal,
          total,
        );
        continue;
      }
      const originalFilename = basename(entry.path.replaceAll("\\", "/"));
      if (!contract.extension.test(originalFilename)) {
        entry.destroy();
        throw new TseContractError("INVALID_MEDIA_FORMAT");
      }
      const normalizedFilename = originalFilename.toLocaleLowerCase("pt-BR");
      if (seenBasenames.has(normalizedFilename)) {
        entry.destroy();
        throw new TseContractError("DUPLICATE_ARCHIVE_ENTRY");
      }
      seenBasenames.add(normalizedFilename);
      const candidateExternalId = parseCandidateExternalId(originalFilename);
      const content = await prepareMediaContent(
        entry,
        contract.magic,
        this.#limits.mediaEntryBytes,
        total,
        request.signal,
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

      if (signal.aborted) {
        await cancelResponseBody(response);
        throw new TseContractError("TSE_REQUEST_ABORTED");
      }
      if (response.url) {
        try {
          assertOfficialUrl(new URL(response.url));
        } catch (error) {
          await cancelResponseBody(response);
          throw error;
        }
      }
      if (redirectStatuses.has(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) {
          await cancelResponseBody(response);
          throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
        }
        let redirectedUrl: URL;
        try {
          redirectedUrl = new URL(location, url);
          assertOfficialUrl(redirectedUrl);
        } catch (error) {
          await cancelResponseBody(response);
          if (error instanceof TypeError) {
            throw new TseContractError("UNSAFE_ARCHIVE_REDIRECT");
          }
          throw error;
        }
        await cancelResponseBody(response);
        url = redirectedUrl;
        continue;
      }
      if (!response.ok || !response.body) {
        await cancelResponseBody(response);
        throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
      }
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (!contentType || !ZIP_CONTENT_TYPES.has(contentType)) {
        await cancelResponseBody(response);
        throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
      }
      return { body: response.body, signal, url: url.toString() };
    }
    throw new TseContractError("INVALID_ARCHIVE_RESPONSE");
  }
}
