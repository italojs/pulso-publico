import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { parse } from "csv-parse";
import { z } from "zod";

import type { Bill } from "#/domain/legislative";
import { mapCamaraBill } from "#/integrations/camara/mapper";
import {
  OfficialSourceError,
  retryingFetch,
  type RetryingRequestInit,
} from "#/server/http/retrying-fetch";

type ArchiveFetcher = (url: URL, init?: RetryingRequestInit) => Promise<Response>;

export interface CamaraArchiveOptions {
  archiveBaseUrl?: string;
  fetcher?: ArchiveFetcher;
  checkedAt?: Date;
}

const rowSchema = z.record(z.string(), z.string());
const defaultArchiveBaseUrl =
  "https://dadosabertos.camara.leg.br/arquivos/proposicoes/csv/";

function optionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function optionalInteger(value: string | undefined) {
  const normalized = optionalText(value);
  if (normalized === null) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function archiveRowToApiShape(raw: unknown) {
  const row = rowSchema.parse(raw);
  return {
    id: row.id,
    uri: row.uri,
    siglaTipo: row.siglaTipo,
    codTipo: optionalInteger(row.codTipo),
    numero: row.numero,
    ano: row.ano,
    descricaoTipo: optionalText(row.descricaoTipo),
    ementa: row.ementa ?? "",
    dataApresentacao: optionalText(row.dataApresentacao),
    statusProposicao: {
      dataHora: optionalText(row.ultimoStatus_dataHora),
      sequencia: optionalInteger(row.ultimoStatus_sequencia),
      siglaOrgao: optionalText(row.ultimoStatus_siglaOrgao),
      uriOrgao: optionalText(row.ultimoStatus_uriOrgao),
      descricaoTramitacao: optionalText(row.ultimoStatus_descricaoTramitacao),
      codTipoTramitacao: optionalText(row.ultimoStatus_idTipoTramitacao),
      descricaoSituacao: optionalText(row.ultimoStatus_descricaoSituacao),
      codSituacao: optionalText(row.ultimoStatus_idSituacao),
      despacho: optionalText(row.ultimoStatus_despacho),
      url: optionalText(row.ultimoStatus_url),
    },
  };
}

function localYear(value: Date) {
  return Temporal.Instant.from(value.toISOString())
    .toZonedDateTimeISO("America/Sao_Paulo")
    .year;
}

function isInsideInterval(value: string, since: Temporal.Instant, until: Temporal.Instant) {
  const instant = Temporal.Instant.from(value);
  return Temporal.Instant.compare(instant, since) >= 0
    && Temporal.Instant.compare(instant, until) <= 0;
}

export async function* streamCamaraBillArchive(
  since: Date,
  until: Date,
  options: CamaraArchiveOptions = {},
): AsyncIterable<Bill> {
  if (since.getTime() > until.getTime()) {
    throw new RangeError("Archive interval must start before it ends");
  }

  const fetcher = options.fetcher ?? retryingFetch;
  const checkedAt = options.checkedAt ?? new Date();
  const baseUrl = new URL(options.archiveBaseUrl ?? defaultArchiveBaseUrl);
  const sinceInstant = Temporal.Instant.from(since.toISOString());
  const untilInstant = Temporal.Instant.from(until.toISOString());

  for (let year = localYear(since); year <= localYear(until); year += 1) {
    const url = new URL(`proposicoes-${year}.csv`, baseUrl);

    try {
      const response = await fetcher(url, { headers: { Accept: "text/csv" } });
      if (!response.ok) {
        throw new OfficialSourceError(
          `Câmara archive request failed with status ${response.status}`,
          url.href,
          response.status,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }
      if (!response.body) {
        throw new Error("Câmara archive response has no body");
      }

      const body = Readable.fromWeb(
        response.body as unknown as NodeReadableStream<Uint8Array>,
      );
      const records = body.pipe(
        parse({
          bom: true,
          columns: true,
          delimiter: ";",
          skip_empty_lines: true,
        }),
      );

      for await (const raw of records) {
        const bill = mapCamaraBill(archiveRowToApiShape(raw), checkedAt);
        if (bill.presentedAt && isInsideInterval(bill.presentedAt, sinceInstant, untilInstant)) {
          yield bill;
        }
      }
    } catch (error) {
      if (error instanceof OfficialSourceError) throw error;
      throw new OfficialSourceError(
        "Official Câmara archive did not match the expected contract",
        url.href,
        null,
        false,
        { cause: error },
      );
    }
  }
}
