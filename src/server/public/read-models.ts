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
  latestActivityAt: string;
  topics: string[];
  authors: PublicAuthor[];
}

export interface PublicBillPage {
  items: PublicBillCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PublicTimelineItem {
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

export interface PublicFilterOptions {
  sources: LegislativeSourceName[];
  statuses: string[];
  topics: string[];
  parties: string[];
  authors: string[];
}

export interface PublicBillFilters {
  query?: string;
  source?: LegislativeSourceName;
  status?: string;
  topic?: string;
  party?: string;
  author?: string;
  page?: number;
  pageSize?: number;
  order?: "updated" | "presented";
}
