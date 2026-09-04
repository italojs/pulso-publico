import { z } from "zod";

import type {
  Bill,
  BillAuthor,
  BillTopic,
  IndividualVote,
  Lawmaker,
  LegislativeBulkBootstrap,
  LegislativeSourceAdapter,
  Movement,
  SyncPage,
  VoteEvent,
} from "#/domain/legislative";
import { streamCamaraBillArchive } from "#/integrations/camara/bootstrap";
import {
  mapCamaraAuthor,
  mapCamaraBill,
  mapCamaraIndividualVote,
  mapCamaraLawmaker,
  mapCamaraLawmakerDetail,
  mapCamaraMovement,
  mapCamaraTopic,
  mapCamaraVoteEvent,
} from "#/integrations/camara/mapper";
import { env } from "#/server/config";
import {
  OfficialSourceError,
  retryingFetch,
  type RetryingRequestInit,
} from "#/server/http/retrying-fetch";

const linkSchema = z.object({
  rel: z.string(),
  href: z.url(),
});

const collectionEnvelopeSchema = z.object({
  dados: z.array(z.unknown()),
  links: z.array(linkSchema).default([]),
});

const itemEnvelopeSchema = z.object({
  dados: z.unknown(),
  links: z.array(linkSchema).default([]),
});

const cursorSchema = z.object({
  kind: z.enum(["bills", "lawmakers"]),
  url: z.url(),
  endDate: z.string().optional(),
});

type CursorState = z.infer<typeof cursorSchema>;
type Fetcher = (url: URL, init?: RetryingRequestInit) => Promise<Response>;

export interface CamaraAdapterOptions {
  baseUrl?: string;
  archiveBaseUrl?: string;
  fetcher?: Fetcher;
  archiveFetcher?: Fetcher;
  now?: () => Date;
}

function encodeCursor(state: CursorState) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

function dateInSaoPaulo(value: Date) {
  return Temporal.Instant.from(value.toISOString())
    .toZonedDateTimeISO("America/Sao_Paulo")
    .toPlainDate()
    .toString();
}

export class CamaraAdapter implements LegislativeSourceAdapter, LegislativeBulkBootstrap {
  readonly source = "camara" as const;
  private readonly baseUrl: URL;
  private readonly archiveBaseUrl: string | undefined;
  private readonly archiveFetcher: Fetcher;
  private readonly fetcher: Fetcher;
  private readonly now: () => Date;

  constructor(options: CamaraAdapterOptions = {}) {
    this.baseUrl = new URL(`${(options.baseUrl ?? env.CAMARA_BASE_URL).replace(/\/$/, "")}/`);
    this.fetcher = options.fetcher ?? retryingFetch;
    this.archiveBaseUrl = options.archiveBaseUrl;
    this.archiveFetcher = options.archiveFetcher ?? this.fetcher;
    this.now = options.now ?? (() => new Date());
  }

  streamInitialBills(since: Date, until: Date): AsyncIterable<Bill> {
    return streamCamaraBillArchive(since, until, {
      archiveBaseUrl: this.archiveBaseUrl,
      fetcher: this.archiveFetcher,
      checkedAt: this.now(),
    });
  }

  async listBillsChangedSince(
    since: Date,
    cursor?: string,
    until?: Date,
  ): Promise<SyncPage<Bill>> {
    const effectiveUntil = until ?? this.now();
    const initialDay = dateInSaoPaulo(since);
    const endDate = dateInSaoPaulo(effectiveUntil);
    if (since.getTime() > effectiveUntil.getTime()) {
      return { items: [], nextCursor: null };
    }
    if (!cursor && Temporal.PlainDate.compare(initialDay, endDate) > 0) {
      return { items: [], nextCursor: null };
    }

    const state = cursor
      ? this.decodeCursor(cursor, "bills")
      : {
          kind: "bills" as const,
          url: this.billDayUrl(initialDay).href,
          endDate,
        };
    if (!state.endDate) {
      throw this.contractError(this.baseUrl, new Error("Bill cursor has no end date"));
    }

    const url = this.assertOfficialUrl(state.url);
    const envelope = await this.fetchCollectionPage(url);
    const checkedAt = this.now();
    let items: Bill[];
    try {
      items = envelope.dados.map((raw) => mapCamaraBill(raw, checkedAt));
    } catch (error) {
      throw this.contractError(url, error);
    }

    const officialNext = envelope.links.find((link) => link.rel === "next")?.href;
    if (officialNext) {
      const nextUrl = this.assertOfficialUrl(officialNext);
      return {
        items,
        nextCursor: encodeCursor({ kind: "bills", url: nextUrl.href, endDate: state.endDate }),
      };
    }

    const currentDay = url.searchParams.get("dataInicio");
    if (!currentDay) {
      throw this.contractError(url, new Error("Câmara page has no dataInicio"));
    }
    const nextDay = Temporal.PlainDate.from(currentDay).add({ days: 1 });
    if (Temporal.PlainDate.compare(nextDay, Temporal.PlainDate.from(state.endDate)) <= 0) {
      return {
        items,
        nextCursor: encodeCursor({
          kind: "bills",
          url: this.billDayUrl(nextDay.toString()).href,
          endDate: state.endDate,
        }),
      };
    }

    return { items, nextCursor: null };
  }

  async getBill(billExternalId: string): Promise<Bill> {
    const url = this.url(`proposicoes/${encodeURIComponent(billExternalId)}`);
    const envelope = await this.fetchItem(url);
    try {
      return mapCamaraBill(envelope.dados, this.now());
    } catch (error) {
      throw this.contractError(url, error);
    }
  }

  async listBillAuthors(billExternalId: string): Promise<BillAuthor[]> {
    const url = this.url(`proposicoes/${encodeURIComponent(billExternalId)}/autores`);
    const values = await this.fetchAllCollectionItems(url);
    return this.mapCollection(url, values, (raw) =>
      mapCamaraAuthor(raw, billExternalId, this.now()),
    );
  }

  async listBillTopics(billExternalId: string): Promise<BillTopic[]> {
    const url = this.url(`proposicoes/${encodeURIComponent(billExternalId)}/temas`);
    const values = await this.fetchAllCollectionItems(url);
    return this.mapCollection(url, values, (raw) =>
      mapCamaraTopic(raw, billExternalId, this.now()),
    );
  }

  async listBillMovements(billExternalId: string): Promise<Movement[]> {
    const url = this.url(`proposicoes/${encodeURIComponent(billExternalId)}/tramitacoes`);
    const values = await this.fetchAllCollectionItems(url);
    return this.mapCollection(url, values, (raw) =>
      mapCamaraMovement(raw, billExternalId, this.now()),
    );
  }

  async listBillVoteEvents(billExternalId: string): Promise<VoteEvent[]> {
    const url = this.url(`proposicoes/${encodeURIComponent(billExternalId)}/votacoes`);
    const values = await this.fetchAllCollectionItems(url);
    return this.mapCollection(url, values, (raw) =>
      mapCamaraVoteEvent(raw, billExternalId, this.now()),
    );
  }

  async listIndividualVotes(voteEventExternalId: string): Promise<IndividualVote[]> {
    const url = this.url(`votacoes/${encodeURIComponent(voteEventExternalId)}/votos`);
    const values = await this.fetchAllCollectionItems(url);
    return this.mapCollection(url, values, (raw) =>
      mapCamaraIndividualVote(raw, voteEventExternalId, this.now()),
    );
  }

  async listActiveLawmakers(cursor?: string): Promise<SyncPage<Lawmaker>> {
    const state = cursor
      ? this.decodeCursor(cursor, "lawmakers")
      : {
          kind: "lawmakers" as const,
          url: this.url("deputados", {
            itens: "100",
            ordem: "ASC",
            ordenarPor: "nome",
          }).href,
        };
    const url = this.assertOfficialUrl(state.url);
    const envelope = await this.fetchCollectionPage(url);
    const items = this.mapCollection(url, envelope.dados, (raw) =>
      mapCamaraLawmaker(raw, this.now()),
    );
    const officialNext = envelope.links.find((link) => link.rel === "next")?.href;

    return {
      items,
      nextCursor: officialNext
        ? encodeCursor({
            kind: "lawmakers",
            url: this.assertOfficialUrl(officialNext).href,
          })
        : null,
    };
  }

  async getLawmaker(lawmakerExternalId: string): Promise<Lawmaker> {
    const url = this.url(`deputados/${encodeURIComponent(lawmakerExternalId)}`);
    const envelope = await this.fetchItem(url);
    try {
      return mapCamaraLawmakerDetail(envelope.dados, this.now());
    } catch (error) {
      throw this.contractError(url, error);
    }
  }

  private billDayUrl(day: string) {
    return this.url("proposicoes", {
      dataInicio: day,
      dataFim: day,
      itens: "100",
      ordem: "ASC",
      ordenarPor: "id",
    });
  }

  private url(path: string, searchParams?: Record<string, string>) {
    const url = new URL(path, this.baseUrl);
    for (const [name, value] of Object.entries(searchParams ?? {})) {
      url.searchParams.set(name, value);
    }
    return url;
  }

  private assertOfficialUrl(value: string) {
    const url = new URL(value);
    const basePath = this.baseUrl.pathname.replace(/\/$/, "");
    if (
      url.origin !== this.baseUrl.origin
      || (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`))
    ) {
      throw this.contractError(this.baseUrl, new Error("Untrusted pagination URL"));
    }
    return url;
  }

  private decodeCursor(cursor: string, expectedKind: CursorState["kind"]) {
    try {
      const state = cursorSchema.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      );
      if (state.kind !== expectedKind) {
        throw new Error("Cursor belongs to another collection");
      }
      this.assertOfficialUrl(state.url);
      return state;
    } catch (error) {
      if (error instanceof OfficialSourceError) throw error;
      throw this.contractError(this.baseUrl, error);
    }
  }

  private async fetchCollectionPage(url: URL) {
    try {
      const response = await this.fetcher(url, { headers: { Accept: "application/json" } });
      this.assertSuccessfulResponse(response, url);
      return collectionEnvelopeSchema.parse(await response.json());
    } catch (error) {
      if (error instanceof OfficialSourceError) throw error;
      throw this.contractError(url, error);
    }
  }

  private async fetchItem(url: URL) {
    try {
      const response = await this.fetcher(url, { headers: { Accept: "application/json" } });
      this.assertSuccessfulResponse(response, url);
      return itemEnvelopeSchema.parse(await response.json());
    } catch (error) {
      if (error instanceof OfficialSourceError) throw error;
      throw this.contractError(url, error);
    }
  }

  private assertSuccessfulResponse(response: Response, url: URL) {
    if (response.ok) return;
    throw new OfficialSourceError(
      `Câmara request failed with status ${response.status}`,
      url.href,
      response.status,
      response.status === 408 || response.status === 429 || response.status >= 500,
    );
  }

  private async fetchAllCollectionItems(initialUrl: URL) {
    const items: unknown[] = [];
    const seen = new Set<string>();
    let nextUrl: URL | null = initialUrl;

    while (nextUrl) {
      if (seen.has(nextUrl.href)) {
        throw this.contractError(nextUrl, new Error("Pagination cycle detected"));
      }
      seen.add(nextUrl.href);
      const envelope = await this.fetchCollectionPage(nextUrl);
      items.push(...envelope.dados);
      const nextHref = envelope.links.find((link) => link.rel === "next")?.href;
      nextUrl = nextHref ? this.assertOfficialUrl(nextHref) : null;
    }

    return items;
  }

  private mapCollection<T>(url: URL, values: unknown[], mapper: (value: unknown) => T) {
    try {
      return values.map(mapper);
    } catch (error) {
      throw this.contractError(url, error);
    }
  }

  private contractError(url: URL, cause: unknown) {
    return new OfficialSourceError(
      "Official Câmara response did not match the expected contract",
      url.href,
      null,
      false,
      { cause },
    );
  }
}
