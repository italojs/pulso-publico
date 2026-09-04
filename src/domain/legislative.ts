import { z } from "zod";

export const LegislativeSource = z.enum(["camara", "senado"]);
export const House = z.enum(["camara", "senado", "congresso"]);
export const VoteChoice = z.enum([
  "sim",
  "nao",
  "abstencao",
  "obstrucao",
  "outro",
  "indisponivel",
]);

const sourced = {
  source: LegislativeSource,
  externalId: z.string().min(1),
  officialUrl: z.url(),
  checkedAt: z.iso.datetime(),
};

export const BillRecord = z.object({
  ...sourced,
  officialCode: z.string().min(1),
  congressionalKey: z.string().min(1).nullable(),
  officialTitle: z.string().min(1),
  officialSummary: z.string().default(""),
  originHouse: House,
  currentHouse: House.nullable(),
  statusCode: z.string().nullable(),
  statusLabel: z.string().min(1),
  presentedAt: z.iso.datetime().nullable(),
});

export const BillAuthorRecord = z.object({
  ...sourced,
  billExternalId: z.string().min(1),
  lawmakerExternalId: z.string().min(1).nullable(),
  officialName: z.string().min(1),
  party: z.string().min(1).nullable(),
  authorKind: z.string().min(1),
  isPrimary: z.boolean(),
});

export const BillTopicRecord = z.object({
  ...sourced,
  billExternalId: z.string().min(1),
  code: z.string().min(1).nullable(),
  label: z.string().min(1),
});

export const LawmakerRecord = z.object({
  ...sourced,
  name: z.string().min(1),
  electoralName: z.string().min(1),
  role: z.enum(["deputado_federal", "senador"]),
  party: z.string().min(1).nullable(),
  region: z.string().length(2).nullable(),
  photoUrl: z.url().nullable(),
  active: z.boolean(),
});

export const MovementRecord = z.object({
  ...sourced,
  billExternalId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  sequence: z.number().int().nonnegative(),
  house: House,
  bodyCode: z.string().min(1).nullable(),
  bodyName: z.string().min(1).nullable(),
  statusCode: z.string().min(1).nullable(),
  statusLabel: z.string().min(1).nullable(),
  officialDescription: z.string().min(1),
});

export const VoteEventRecord = z.object({
  ...sourced,
  billExternalId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  house: House,
  description: z.string().min(1),
  result: z.string().min(1).nullable(),
  isNominal: z.boolean(),
  isSecret: z.boolean(),
});

export const IndividualVoteRecord = z.object({
  ...sourced,
  voteEventExternalId: z.string().min(1),
  lawmakerExternalId: z.string().min(1),
  choice: VoteChoice,
  rawChoice: z.string().min(1),
});

export type Bill = z.infer<typeof BillRecord>;
export type BillAuthor = z.infer<typeof BillAuthorRecord>;
export type BillTopic = z.infer<typeof BillTopicRecord>;
export type Lawmaker = z.infer<typeof LawmakerRecord>;
export type Movement = z.infer<typeof MovementRecord>;
export type VoteEvent = z.infer<typeof VoteEventRecord>;
export type IndividualVote = z.infer<typeof IndividualVoteRecord>;
export type LegislativeSourceName = z.infer<typeof LegislativeSource>;

export interface SyncPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface LegislativeSourceAdapter {
  readonly source: LegislativeSourceName;
  listBillsChangedSince(
    since: Date,
    cursor?: string,
    until?: Date,
  ): Promise<SyncPage<Bill>>;
  getBill(billExternalId: string): Promise<Bill>;
  listBillAuthors(billExternalId: string): Promise<BillAuthor[]>;
  listBillTopics(billExternalId: string): Promise<BillTopic[]>;
  listBillMovements(billExternalId: string): Promise<Movement[]>;
  listBillVoteEvents(billExternalId: string): Promise<VoteEvent[]>;
  listIndividualVotes(voteEventExternalId: string): Promise<IndividualVote[]>;
  listActiveLawmakers(cursor?: string): Promise<SyncPage<Lawmaker>>;
  getLawmaker(lawmakerExternalId: string): Promise<Lawmaker>;
}

export interface LegislativeBulkBootstrap {
  streamInitialBills(since: Date, until: Date): AsyncIterable<Bill>;
}
