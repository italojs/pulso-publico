import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

import { parse } from "csv-parse";
import { z } from "zod";

import type {
  ArchivedIndividualVote,
  Bill,
  BillAuthor,
  BillTopic,
  LegislativeCatalogItem,
} from "#/domain/legislative";
import {
  mapCamaraAuthor,
  mapCamaraBill,
  mapCamaraIndividualVote,
  mapCamaraLawmaker,
  mapCamaraTopic,
} from "#/integrations/camara/mapper";
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

function relatedArchiveBase(
  baseUrl: URL,
  dataset: "proposicoesAutores" | "proposicoesTemas" | "votacoesVotos",
) {
  return new URL(`../../${dataset}/csv/`, baseUrl);
}

function localDateTimeInstant(value: string) {
  const normalized = value.trim().replace(" ", "T");
  if (/(?:Z|[+-]\d{2}:\d{2})$/u.test(normalized)) {
    return Temporal.Instant.from(normalized);
  }
  return Temporal.PlainDateTime.from(normalized)
    .toZonedDateTime("America/Sao_Paulo")
    .toInstant();
}

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

async function downloadAnnualArchive(fetcher: ArchiveFetcher, url: URL) {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
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
      if (!response.body) throw new Error("Câmara archive response has no body");
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof OfficialSourceError && !error.retryable) throw error;
      if (attempt === attempts) {
        if (error instanceof OfficialSourceError) throw error;
        throw new OfficialSourceError(
          "Official Câmara archive download was interrupted",
          url.href,
          null,
          true,
          { cause: error },
        );
      }
      await delay(250 * 2 ** (attempt - 1));
    }
  }
  throw new Error("unreachable archive download state");
}

async function parseArchiveRows(archive: Buffer) {
  const rows: Array<Record<string, string>> = [];
  const records = Readable.from([archive]).pipe(parse({
    bom: true,
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
  }));
  for await (const raw of records) rows.push(rowSchema.parse(raw));
  return rows;
}

function propositionIdFromUri(value: string | undefined) {
  return optionalText(value)?.match(/\/proposicoes\/(\d+)\/?$/u)?.[1] ?? null;
}

async function catalogRelationsForYear(
  year: number,
  options: CamaraArchiveOptions,
  baseUrl: URL,
) {
  const fetcher = options.fetcher ?? retryingFetch;
  const checkedAt = options.checkedAt ?? new Date();
  const [authorRows, topicRows] = await Promise.all([
    downloadAnnualArchive(
      fetcher,
      new URL(`proposicoesAutores-${year}.csv`, relatedArchiveBase(baseUrl, "proposicoesAutores")),
    ).then(parseArchiveRows),
    downloadAnnualArchive(
      fetcher,
      new URL(`proposicoesTemas-${year}.csv`, relatedArchiveBase(baseUrl, "proposicoesTemas")),
    ).then(parseArchiveRows),
  ]);
  const authors = new Map<string, BillAuthor[]>();
  const topics = new Map<string, BillTopic[]>();

  for (const row of authorRows) {
    const billExternalId = optionalText(row.idProposicao)
      ?? propositionIdFromUri(row.uriProposicao);
    const name = optionalText(row.nomeAutor);
    const type = optionalText(row.tipoAutor);
    if (!billExternalId || !name || !type) continue;
    const mapped = mapCamaraAuthor({
      uri: optionalText(row.uriAutor),
      nome: name,
      codTipo: optionalText(row.codTipoAutor),
      tipo: type,
      ordemAssinatura: optionalInteger(row.ordemAssinatura),
      proponente: optionalInteger(row.proponente),
    }, billExternalId, checkedAt);
    const current = authors.get(billExternalId) ?? [];
    current.push({ ...mapped, party: optionalText(row.siglaPartidoAutor) });
    authors.set(billExternalId, current);
  }

  for (const row of topicRows) {
    const billExternalId = propositionIdFromUri(row.uriProposicao);
    const label = optionalText(row.tema);
    if (!billExternalId || !label) continue;
    const mapped = mapCamaraTopic({
      codTema: optionalText(row.codTema),
      tema: label,
    }, billExternalId, checkedAt);
    const current = topics.get(billExternalId) ?? [];
    current.push(mapped);
    topics.set(billExternalId, current);
  }

  return { authors, topics };
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
      const archive = await downloadAnnualArchive(fetcher, url);
      const body = Readable.from([archive]);
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

export async function* streamCamaraCatalogArchive(
  since: Date,
  until: Date,
  options: CamaraArchiveOptions = {},
): AsyncIterable<LegislativeCatalogItem> {
  if (since.getTime() > until.getTime()) {
    throw new RangeError("Archive interval must start before it ends");
  }
  const baseUrl = new URL(options.archiveBaseUrl ?? defaultArchiveBaseUrl);

  for (let year = localYear(since); year <= localYear(until); year += 1) {
    const relations = await catalogRelationsForYear(year, options, baseUrl);
    const yearStart = Temporal.PlainDate.from(`${year}-01-01`)
      .toZonedDateTime("America/Sao_Paulo")
      .toInstant();
    const nextYear = Temporal.PlainDate.from(`${year + 1}-01-01`)
      .toZonedDateTime("America/Sao_Paulo")
      .toInstant();
    const boundedSince = new Date(Math.max(since.getTime(), yearStart.epochMilliseconds));
    const boundedUntil = new Date(Math.min(until.getTime(), nextYear.epochMilliseconds - 1));

    for await (const bill of streamCamaraBillArchive(boundedSince, boundedUntil, options)) {
      yield {
        bill,
        authors: relations.authors.get(bill.externalId) ?? [],
        topics: relations.topics.get(bill.externalId) ?? [],
      };
    }
  }
}

export async function* streamCamaraIndividualVoteArchive(
  since: Date,
  until: Date,
  options: CamaraArchiveOptions = {},
): AsyncIterable<ArchivedIndividualVote> {
  if (since.getTime() > until.getTime()) {
    throw new RangeError("Archive interval must start before it ends");
  }

  const fetcher = options.fetcher ?? retryingFetch;
  const checkedAt = options.checkedAt ?? new Date();
  const proposalBaseUrl = new URL(options.archiveBaseUrl ?? defaultArchiveBaseUrl);
  const voteBaseUrl = relatedArchiveBase(proposalBaseUrl, "votacoesVotos");
  const sinceInstant = Temporal.Instant.from(since.toISOString());
  const untilInstant = Temporal.Instant.from(until.toISOString());

  for (let year = localYear(since); year <= localYear(until); year += 1) {
    const url = new URL(`votacoesVotos-${year}.csv`, voteBaseUrl);
    try {
      const archive = await downloadAnnualArchive(fetcher, url);
      const records = Readable.from([archive]).pipe(parse({
        bom: true,
        columns: true,
        delimiter: ";",
        skip_empty_lines: true,
      }));

      for await (const raw of records) {
        const row = rowSchema.parse(raw);
        const voteEventExternalId = optionalText(row.idVotacao);
        const votedAt = optionalText(row.dataHoraVoto);
        const lawmakerExternalId = optionalText(row.deputado_id);
        const lawmakerName = optionalText(row.deputado_nome);
        if (!voteEventExternalId || !votedAt || !lawmakerExternalId || !lawmakerName) continue;
        const voteInstant = localDateTimeInstant(votedAt);
        if (
          Temporal.Instant.compare(voteInstant, sinceInstant) < 0
          || Temporal.Instant.compare(voteInstant, untilInstant) > 0
        ) continue;

        const deputy = {
          id: lawmakerExternalId,
          uri: optionalText(row.deputado_uri)
            ?? `https://dadosabertos.camara.leg.br/api/v2/deputados/${lawmakerExternalId}`,
          nome: lawmakerName,
          siglaPartido: optionalText(row.deputado_siglaPartido),
          siglaUf: optionalText(row.deputado_siglaUf),
          urlFoto: optionalText(row.deputado_urlFoto),
        };
        yield {
          vote: mapCamaraIndividualVote({
            tipoVoto: optionalText(row.voto),
            dataRegistroVoto: votedAt,
            deputado_: deputy,
          }, voteEventExternalId, checkedAt),
          lawmaker: { ...mapCamaraLawmaker(deputy, checkedAt), active: false },
        };
      }
    } catch (error) {
      if (error instanceof OfficialSourceError) throw error;
      throw new OfficialSourceError(
        "Official Câmara individual vote archive did not match the expected contract",
        url.href,
        null,
        false,
        { cause: error },
      );
    }
  }
}
