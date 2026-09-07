import { z } from "zod";

import { normalizeProposalType } from "#/domain/bill-facets";
import type {
  Bill,
  BillAuthor,
  BillTopic,
  IndividualVote,
  Lawmaker,
  LegislativeCatalogBootstrap,
  LegislativeSourceAdapter,
  Movement,
  SyncPage,
  VoteEvent,
} from "#/domain/legislative";
import {
  mapSenadoAuthor,
  mapSenadoBill,
  mapSenadoCatalogAuthor,
  mapSenadoIndividualVote,
  mapSenadoLawmaker,
  mapSenadoLawmakerDetail,
  mapSenadoMovement,
  mapSenadoTopic,
  mapSenadoVoteEvent,
} from "#/integrations/senado/mapper";
import { env } from "#/server/config";
import {
  OfficialSourceError,
  retryingFetch,
  type RetryingRequestInit,
} from "#/server/http/retrying-fetch";

type Fetcher = (url: URL, init?: RetryingRequestInit) => Promise<Response>;

export interface SenadoAdapterOptions {
  baseUrl?: string;
  fetcher?: Fetcher;
  now?: () => Date;
}

const processListSchema = z.array(z.unknown());
const processUpdateSchema = z.object({
  dataUltimaAtualizacao: z.string().min(1),
});
const processRelationsSchema = z.object({
  documento: z.object({
    autoria: z.array(z.unknown()).optional(),
  }).optional(),
  classificacoes: z.array(z.unknown()).optional(),
  autuacoes: z.array(z.object({
    informesLegislativos: z.array(z.unknown()).optional(),
  })).optional(),
});
const voteIdentitySchema = z.object({
  idProcesso: z.union([z.string(), z.number()]).transform(String),
  codigoSessaoVotacao: z.union([z.string(), z.number()]).transform(String),
  votos: z.array(z.unknown()).optional(),
});
const senatorListSchema = z.object({
  ListaParlamentarEmExercicio: z.object({
    Parlamentares: z.object({
      Parlamentar: z.array(z.unknown()),
    }),
  }),
});
const historyCursorSchema = z.object({
  kind: z.literal("history"),
  nextStartDate: z.iso.date(),
  finalDate: z.iso.date(),
  sinceInstant: z.iso.datetime(),
  untilInstant: z.iso.datetime(),
});

type HistoryCursor = z.infer<typeof historyCursorSchema>;

function dateInSaoPaulo(value: Date) {
  return Temporal.Instant.from(value.toISOString())
    .toZonedDateTimeISO("America/Sao_Paulo")
    .toPlainDate();
}

function encodeCursor(value: HistoryCursor) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function isInside(value: string | null, since: string, until: string) {
  if (!value) return false;
  const instant = Temporal.Instant.from(value);
  return Temporal.Instant.compare(instant, Temporal.Instant.from(since)) >= 0
    && Temporal.Instant.compare(instant, Temporal.Instant.from(until)) <= 0;
}

function localTimestampToInstant(value: string) {
  const normalized = value.trim().replace(" ", "T");
  if (/(?:Z|[+-]\d{2}:\d{2})$/u.test(normalized)) {
    return Temporal.Instant.from(normalized);
  }
  return Temporal.PlainDateTime.from(normalized)
    .toZonedDateTime("America/Sao_Paulo")
    .toInstant();
}

function wasUpdatedInside(raw: unknown, since: Date, until: Date) {
  const value = processUpdateSchema.parse(raw);
  const updatedAt = localTimestampToInstant(value.dataUltimaAtualizacao);
  const start = Temporal.Instant.from(since.toISOString());
  const end = Temporal.Instant.from(until.toISOString());
  return Temporal.Instant.compare(updatedAt, start) >= 0
    && Temporal.Instant.compare(updatedAt, end) <= 0;
}

export class SenadoAdapter implements LegislativeSourceAdapter, LegislativeCatalogBootstrap {
  readonly source = "senado" as const;
  private readonly baseUrl: URL;
  private readonly fetcher: Fetcher;
  private readonly now: () => Date;
  private readonly inFlightProcesses = new Map<string, Promise<unknown>>();
  private readonly capturedCatalogAuthors = new Map<string, BillAuthor[]>();
  private captureCatalogRelations = false;

  constructor(options: SenadoAdapterOptions = {}) {
    this.baseUrl = new URL(`${(options.baseUrl ?? env.SENADO_BASE_URL).replace(/\/$/, "")}/`);
    this.fetcher = options.fetcher ?? retryingFetch;
    this.now = options.now ?? (() => new Date());
  }

  async listBillsChangedSince(
    since: Date,
    cursor?: string,
    until?: Date,
  ): Promise<SyncPage<Bill>> {
    const observedAt = this.now();
    const effectiveUntil = until ?? observedAt;
    if (since.getTime() > effectiveUntil.getTime()) {
      return { items: [], nextCursor: null };
    }

    const recentDays = Math.max(
      1,
      Math.ceil((observedAt.getTime() - since.getTime()) / 86_400_000),
    );
    if (
      !cursor
      && recentDays <= 30
      && effectiveUntil.getTime() <= observedAt.getTime()
    ) {
      const url = this.url("processo", { numdias: String(recentDays) });
      try {
        const values = processListSchema.parse(await this.fetchJson(url));
        const boundedValues = values.filter((raw) =>
          wasUpdatedInside(raw, since, effectiveUntil)
        );
        return { items: this.mapBills(url, boundedValues), nextCursor: null };
      } catch (error) {
        if (error instanceof OfficialSourceError) throw error;
        throw this.contractError(url, error);
      }
    }

    const state = cursor
      ? this.decodeCursor(cursor)
      : {
          kind: "history" as const,
          nextStartDate: dateInSaoPaulo(since).toString(),
          finalDate: dateInSaoPaulo(effectiveUntil).toString(),
          sinceInstant: since.toISOString(),
          untilInstant: effectiveUntil.toISOString(),
        };
    const start = Temporal.PlainDate.from(state.nextStartDate);
    const finalDate = Temporal.PlainDate.from(state.finalDate);
    if (Temporal.PlainDate.compare(start, finalDate) > 0) {
      return { items: [], nextCursor: null };
    }
    const monthEnd = start.with({ day: 1 }).add({ months: 1 }).subtract({ days: 1 });
    const windowEnd = Temporal.PlainDate.compare(monthEnd, finalDate) < 0
      ? monthEnd
      : finalDate;
    const url = this.url("processo", {
      dataInicioApresentacao: start.toString(),
      dataFimApresentacao: windowEnd.toString(),
    });
    const values = processListSchema.parse(await this.fetchJson(url));
    const items = this.mapBills(url, values).filter((bill) =>
      isInside(bill.presentedAt, state.sinceInstant, state.untilInstant),
    );
    const nextStart = windowEnd.add({ days: 1 });

    return {
      items,
      nextCursor: Temporal.PlainDate.compare(nextStart, finalDate) <= 0
        ? encodeCursor({ ...state, nextStartDate: nextStart.toString() })
        : null,
    };
  }

  async getBill(billExternalId: string): Promise<Bill> {
    const url = this.url(`processo/${encodeURIComponent(billExternalId)}`);
    const raw = await this.fetchProcess(billExternalId);
    try {
      return mapSenadoBill(raw, this.now());
    } catch (error) {
      throw this.contractError(url, error);
    }
  }

  async *streamInitialCatalog(since: Date, until: Date) {
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    this.captureCatalogRelations = true;
    try {
      do {
        const page = await this.listBillsChangedSince(since, cursor, until);
        for (const bill of page.items) {
          const authors = this.capturedCatalogAuthors.get(bill.externalId) ?? [];
          this.capturedCatalogAuthors.delete(bill.externalId);
          yield { bill, authors, topics: [] };
        }
        cursor = page.nextCursor ?? undefined;
        if (cursor) {
          if (seenCursors.has(cursor)) {
            throw this.contractError(this.baseUrl, new Error("Senate catalog repeated a cursor"));
          }
          seenCursors.add(cursor);
        }
      } while (cursor);
    } finally {
      this.captureCatalogRelations = false;
      this.capturedCatalogAuthors.clear();
    }
  }

  async findBillsByOfficialIdentity(identity: {
    proposalType: string;
    proposalNumber: number;
    proposalYear: number;
  }): Promise<Bill[]> {
    const proposalType = normalizeProposalType(identity.proposalType);
    if (!proposalType) return [];
    const start = Temporal.PlainDate.from(`${identity.proposalYear}-01-01`)
      .toZonedDateTime("America/Sao_Paulo")
      .toInstant();
    const end = Temporal.PlainDate.from(`${identity.proposalYear + 1}-01-01`)
      .toZonedDateTime("America/Sao_Paulo")
      .toInstant()
      .subtract({ milliseconds: 1 });
    const expectedKey = `${proposalType.toLowerCase()}:${identity.proposalNumber}:${identity.proposalYear}`;
    const matches: Bill[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    do {
      const page = await this.listBillsChangedSince(
        new Date(start.epochMilliseconds),
        cursor,
        new Date(end.epochMilliseconds),
      );
      matches.push(...page.items.filter((bill) =>
        bill.proposalType === proposalType
        && bill.proposalNumber === identity.proposalNumber
        && bill.proposalYear === identity.proposalYear
        && bill.congressionalKey === expectedKey
      ));
      if (!page.nextCursor) break;
      if (seenCursors.has(page.nextCursor)) {
        throw this.contractError(this.baseUrl, new Error("Senate identity lookup repeated a cursor"));
      }
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    } while (cursor);

    return matches;
  }

  async listBillAuthors(billExternalId: string): Promise<BillAuthor[]> {
    const url = this.url(`processo/${encodeURIComponent(billExternalId)}`);
    const raw = await this.fetchProcess(billExternalId);
    try {
      const detail = processRelationsSchema.parse(raw);
      return (detail.documento?.autoria ?? []).map((author) =>
        mapSenadoAuthor(author, billExternalId, this.now()),
      );
    } catch (error) {
      throw this.contractError(url, error);
    }
  }

  async listBillTopics(billExternalId: string): Promise<BillTopic[]> {
    const url = this.url(`processo/${encodeURIComponent(billExternalId)}`);
    const raw = await this.fetchProcess(billExternalId);
    try {
      const detail = processRelationsSchema.parse(raw);
      return (detail.classificacoes ?? []).map((topic) =>
        mapSenadoTopic(topic, billExternalId, this.now()),
      );
    } catch (error) {
      throw this.contractError(url, error);
    }
  }

  async listBillMovements(billExternalId: string): Promise<Movement[]> {
    const url = this.url(`processo/${encodeURIComponent(billExternalId)}`);
    const raw = await this.fetchProcess(billExternalId);
    try {
      const detail = processRelationsSchema.parse(raw);
      const informes = (detail.autuacoes ?? []).flatMap(
        (autuacao) => autuacao.informesLegislativos ?? [],
      );
      const mapped = informes.map((movement, sequence) =>
        mapSenadoMovement(movement, billExternalId, sequence, this.now()),
      );
      return [
        ...new Map(mapped.map((movement) => [movement.externalId, movement])).values(),
      ].map((movement, sequence) => ({ ...movement, sequence }));
    } catch (error) {
      throw this.contractError(url, error);
    }
  }

  async listBillVoteEvents(billExternalId: string): Promise<VoteEvent[]> {
    const url = this.url("votacao", { idProcesso: billExternalId });
    const values = await this.fetchVotes(url);
    try {
      return values.map((vote) => mapSenadoVoteEvent(vote, billExternalId, this.now()));
    } catch (error) {
      throw this.contractError(url, error);
    }
  }

  async listIndividualVotes(voteEventExternalId: string): Promise<IndividualVote[]> {
    const [processId, sessionVoteId, ...rest] = voteEventExternalId.split(":");
    if (!processId || !sessionVoteId || rest.length > 0) {
      throw this.contractError(this.baseUrl, new Error("Invalid Senado vote identity"));
    }
    const url = this.url("votacao", { idProcesso: processId });
    const values = await this.fetchVotes(url);
    const rawVote = values.find((vote) => {
      const identity = voteIdentitySchema.parse(vote);
      return identity.idProcesso === processId
        && identity.codigoSessaoVotacao === sessionVoteId;
    });
    if (!rawVote) return [];

    try {
      const vote = voteIdentitySchema.parse(rawVote);
      return (vote.votos ?? []).map((individualVote) =>
        mapSenadoIndividualVote(individualVote, voteEventExternalId, this.now()),
      );
    } catch (error) {
      throw this.contractError(url, error);
    }
  }

  async listActiveLawmakers(cursor?: string): Promise<SyncPage<Lawmaker>> {
    const url = this.url("senador/lista/atual");
    if (cursor) {
      throw this.contractError(url, new Error("Senado current list has one page"));
    }
    try {
      const raw = senatorListSchema.parse(await this.fetchJson(url));
      return {
        items: raw.ListaParlamentarEmExercicio.Parlamentares.Parlamentar.map(
          (senator) => mapSenadoLawmaker(senator, this.now()),
        ),
        nextCursor: null,
      };
    } catch (error) {
      if (error instanceof OfficialSourceError) throw error;
      throw this.contractError(url, error);
    }
  }

  async getLawmaker(lawmakerExternalId: string): Promise<Lawmaker> {
    const url = this.url(`senador/${encodeURIComponent(lawmakerExternalId)}`);
    try {
      return mapSenadoLawmakerDetail(await this.fetchJson(url), this.now());
    } catch (error) {
      if (error instanceof OfficialSourceError) throw error;
      throw this.contractError(url, error);
    }
  }

  private url(path: string, searchParams?: Record<string, string>) {
    const url = new URL(path, this.baseUrl);
    for (const [name, value] of Object.entries(searchParams ?? {})) {
      url.searchParams.set(name, value);
    }
    return url;
  }

  private decodeCursor(cursor: string) {
    try {
      return historyCursorSchema.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      );
    } catch (error) {
      throw this.contractError(this.baseUrl, error);
    }
  }

  private async fetchJson(url: URL) {
    try {
      const response = await this.fetcher(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new OfficialSourceError(
          `Senado request failed with status ${response.status}`,
          url.href,
          response.status,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof OfficialSourceError) throw error;
      throw this.contractError(url, error);
    }
  }

  private async fetchProcess(billExternalId: string) {
    const active = this.inFlightProcesses.get(billExternalId);
    if (active) return active;

    const url = this.url(`processo/${encodeURIComponent(billExternalId)}`);
    const request = this.fetchJson(url);
    this.inFlightProcesses.set(billExternalId, request);
    try {
      return await request;
    } finally {
      if (this.inFlightProcesses.get(billExternalId) === request) {
        this.inFlightProcesses.delete(billExternalId);
      }
    }
  }

  private async fetchVotes(url: URL) {
    const raw = await this.fetchJson(url);
    try {
      return processListSchema.parse(raw);
    } catch (error) {
      throw this.contractError(url, error);
    }
  }

  private mapBills(url: URL, values: unknown[]) {
    try {
      return values.map((process) => {
        const bill = mapSenadoBill(process, this.now());
        if (this.captureCatalogRelations) {
          const author = mapSenadoCatalogAuthor(process, bill.externalId, this.now());
          this.capturedCatalogAuthors.set(bill.externalId, author ? [author] : []);
        }
        return bill;
      });
    } catch (error) {
      throw this.contractError(url, error);
    }
  }

  private contractError(url: URL, cause: unknown) {
    return new OfficialSourceError(
      "Official Senado response did not match the expected contract",
      url.href,
      null,
      false,
      { cause },
    );
  }
}
