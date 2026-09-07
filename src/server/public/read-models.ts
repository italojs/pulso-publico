import type { LegislativeSourceName } from "#/domain/legislative";

export interface PublicAuthor {
  name: string;
  party: string | null;
  kind: string;
  primary: boolean;
  lawmakerExternalId: string | null;
  source: LegislativeSourceName;
  officialUrl: string;
}

export interface PublicBillCard {
  source: LegislativeSourceName;
  externalId: string;
  officialCode: string;
  officialTitle: string;
  officialSummary: string;
  officialUrl: string;
  statusLabel: string;
  originHouse: "camara" | "senado" | "congresso";
  currentHouse: "camara" | "senado" | "congresso" | null;
  presentedAt: string | null;
  checkedAt: string;
  latestActivityAt: string | null;
  topics: string[];
  authors: PublicAuthor[];
  friendlyTitle?: string | null;
  shortDescription?: string | null;
}

export interface PublicBillPage {
  items: PublicBillCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PublicTimelineItem {
  source: LegislativeSourceName;
  externalId: string;
  occurredAt: string;
  sequence: number;
  house: "camara" | "senado" | "congresso";
  bodyName: string | null;
  statusLabel: string | null;
  description: string;
  officialUrl: string;
}

export interface PublicIndividualVote {
  lawmakerExternalId: string;
  lawmakerName: string;
  party: string | null;
  region: string | null;
  choice: "sim" | "nao" | "abstencao" | "obstrucao" | "outro" | "indisponivel";
  rawChoice: string;
  officialUrl: string;
}

export interface PublicVoteEvent {
  externalId: string;
  occurredAt: string;
  house: "camara" | "senado" | "congresso";
  description: string;
  result: string | null;
  isNominal: boolean;
  isSecret: boolean;
  officialUrl: string;
  individualVotes: PublicIndividualVote[];
}

export interface PublicBillDetail extends PublicBillCard {
  timeline: PublicTimelineItem[];
  voteEvents: PublicVoteEvent[];
}

export interface PublicLawmakerIdentity {
  source: LegislativeSourceName;
  externalId: string;
  name: string;
  electoralName: string;
  role: "deputado_federal" | "senador";
  party: string | null;
  region: string | null;
  photoUrl: string | null;
  active: boolean;
  officialUrl: string;
  checkedAt: string;
}

export interface PublicLawmakerVote {
  voteExternalId: string;
  billSource: LegislativeSourceName;
  billExternalId: string;
  officialCode: string;
  officialTitle: string;
  occurredAt: string;
  description: string;
  result: string | null;
  choice: PublicIndividualVote["choice"];
  rawChoice: string;
  officialUrl: string;
}

export interface PublicLawmakerDetail {
  lawmaker: PublicLawmakerIdentity;
  authoredBills: PublicBillCard[];
  votes: PublicLawmakerVote[];
}

export interface PublicFilterOption<T extends string = string> {
  value: T;
  label: string;
}

export interface PublicFilterOptions {
  sources: LegislativeSourceName[];
  proposalTypes: string[];
  years: number[];
  originHouses: PublicFilterOption<Exclude<PublicHouse, "nao_informada">>[];
  currentHouses: PublicFilterOption<PublicHouse>[];
  stages: PublicFilterOption<PublicBillStage>[];
  statuses: string[];
  voteKinds: PublicFilterOption<PublicVoteKind>[];
  voteResults: PublicFilterOption<PublicVoteResult>[];
  voteHouses: PublicFilterOption<Exclude<PublicHouse, "nao_informada">>[];
  topics: string[];
  parties: string[];
  authors: string[];
  regions: PublicFilterOption[];
}

export type PublicHouse = "camara" | "senado" | "congresso" | "nao_informada";
export type PublicBillStage =
  | "presented"
  | "committees"
  | "ready_for_vote"
  | "voted"
  | "sanction_or_veto"
  | "closed"
  | "unclassified";
export type PublicVotePresence = "with" | "without";
export type PublicVoteKind = "nominal" | "secret" | "non_nominal";
export type PublicIndividualVoteAvailability = "available" | "unavailable";
export type PublicVoteResult = "approved" | "rejected" | "other" | "unavailable";
export type PublicRecentActivity = "24h" | "7d" | "30d";
export type PublicBillOrder =
  | "updated"
  | "presented_desc"
  | "presented_asc"
  | "most_movements"
  | "most_votes"
  /** @deprecated Kept while the existing feed UI is migrated to the advanced order values. */
  | "presented";

export interface PublicBillFilters {
  query?: string;
  proposalTypes?: string[];
  proposalNumber?: number;
  yearFrom?: number;
  yearTo?: number;
  sources?: LegislativeSourceName[];
  originHouses?: Exclude<PublicHouse, "nao_informada">[];
  currentHouses?: PublicHouse[];
  stages?: PublicBillStage[];
  statuses?: string[];
  presentedStart?: string;
  presentedEnd?: string;
  activityStart?: string;
  activityEnd?: string;
  recentActivity?: PublicRecentActivity;
  votePresence?: PublicVotePresence;
  voteKinds?: PublicVoteKind[];
  individualVoteAvailability?: PublicIndividualVoteAvailability;
  voteResults?: PublicVoteResult[];
  voteHouses?: Exclude<PublicHouse, "nao_informada">[];
  topics?: string[];
  authors?: string[];
  parties?: string[];
  regions?: string[];
  followedOnly?: boolean;
  page?: number;
  pageSize?: number;
  order?: PublicBillOrder;

  /** @deprecated Legacy scalar aliases removed by the advanced feed UI. */
  proposalType?: string;
  source?: LegislativeSourceName;
  status?: string;
  topic?: string;
  party?: string;
  author?: string;
}
