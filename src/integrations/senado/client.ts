import { z } from "zod";

import type {
  Bill,
  BillAuthor,
  BillTopic,
  IndividualVote,
  Lawmaker,
  LegislativeSourceAdapter,
  Movement,
  SyncPage,
  VoteEvent,
} from "#/domain/legislative";
import {
  mapSenadoAuthor,
  mapSenadoBill,
  mapSenadoIndividualVote,
  mapSenadoLawmaker,
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

export class SenadoAdapter implements LegislativeSourceAdapter {
  readonly source = "senado" as const;
  private readonly baseUrl: URL;
  private readonly fetcher: Fetcher;
  private readonly now: () => Date;
  private readonly inFlightProcesses = new Map<string, Promise<unknown>>();

  constructor(options: SenadoAdapterOptions = {}) {
    this.baseUrl = new URL(`${(options.baseUrl ?? env.SENADO_BASE_URL).replace(/\/$/, "")}/`);
    this.fetcher = options.fetcher ?? retryingFetch;
    this.now = options.now ?? (() => new Date());
  }

  async listBillsChangedSince(since: Date, cursor?: string): Promise<SyncPage<Bill>> {
    const now = this.now();
    if (since.getTime() > now.getTime()) return { items: [], nextCursor: null };

    const elapsedDays = Math.max(1, Math.ceil((now.getTime() - since.getTime()) / 86_400_000));
    if (!cursor && elapsedDays <= 30) {
      const url = this.url("processo", { numdias: String(elapsedDays) });
      const values = processListSchema.parse(await this.fetchJson(url));
      return { items: this.mapBills(url, values), nextCursor: null };
    }

    const state = cursor
      ? this.decodeCursor(cursor)
      : {
          kind: "history" as const,
          nextStartDate: dateInSaoPaulo(since).toString(),
          finalDate: dateInSaoPaulo(now).toString(),
          sinceInstant: since.toISOString(),
          untilInstant: now.toISOString(),
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
      return informes.map((movement, sequence) =>
        mapSenadoMovement(movement, billExternalId, sequence, this.now()),
      );
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
      return values.map((process) => mapSenadoBill(process, this.now()));
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
