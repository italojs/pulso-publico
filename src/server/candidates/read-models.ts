import type { CandidateOffice } from "#/domain/electoral";

export type CandidateOrder =
  | "name"
  | "number"
  | "updated"
  | "assets_desc"
  | "revenue_desc"
  | "expenses_desc"
  | "projects_desc"
  | "votes_desc";

export type CandidateFundingKind = "public" | "private" | "own";
export type CandidateLawmakerHouse = "camara" | "senado";

export interface CandidateFilters {
  query?: string;
  electionYears?: number[];
  offices?: CandidateOffice[];
  regions?: string[];
  parties?: string[];
  rounds?: number[];
  statuses?: string[];
  federations?: string[];
  coalitions?: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: string[];
  races?: string[];
  educations?: string[];
  occupations?: string[];
  declaredAssets?: "yes" | "no";
  assetMinCents?: bigint;
  assetMaxCents?: bigint;
  assetCountMin?: number;
  assetCountMax?: number;
  assetCategories?: string[];
  revenueMinCents?: bigint;
  revenueMaxCents?: bigint;
  expenseMinCents?: bigint;
  expenseMaxCents?: bigint;
  balanceMinCents?: bigint;
  balanceMaxCents?: bigint;
  fundingKinds?: CandidateFundingKind[];
  hasPhoto?: boolean;
  hasSocial?: boolean;
  hasGovernmentPlan?: boolean;
  hasCertificates?: boolean;
  hasFinance?: boolean;
  hasConfirmedLawmaker?: boolean;
  lawmakerHouses?: CandidateLawmakerHouse[];
  activeMandate?: boolean;
  topics?: string[];
  followedOnly?: boolean;
  order?: CandidateOrder;
  page?: number;
  pageSize?: number;
}

export interface CandidateFilterOption<T extends string = string> {
  value: T;
  label: string;
}

export interface CandidateFilterOptions {
  snapshots: Array<{ electionYear: number; extractedAt: string | null }>;
  electionYears: number[];
  offices: CandidateFilterOption<CandidateOffice>[];
  regions: string[];
  parties: string[];
  rounds: number[];
  statuses: string[];
  federations: string[];
  coalitions: string[];
  genders: string[];
  races: string[];
  educations: string[];
  occupations: string[];
  assetCategories: string[];
  fundingKinds: CandidateFilterOption<CandidateFundingKind>[];
  lawmakerHouses: CandidateFilterOption<CandidateLawmakerHouse>[];
  topics: string[];
}

export interface PublicCandidateFinance {
  revenueCents: string | null;
  expenseCents: string | null;
  balanceCents: string | null;
  revenueByCategory: Record<string, string>;
  expenseByCategory: Record<string, string>;
  sourceArchiveUrl: string | null;
  sourceExtractedAt: string;
  checkedAt: string;
}

export interface PublicCandidateCard {
  electionYear: number;
  externalId: string;
  fullName: string;
  ballotName: string;
  socialName: string | null;
  number: number;
  office: CandidateOffice;
  round: number;
  region: string;
  electoralUnit: string;
  status: string;
  statusDetail: string | null;
  partyAcronym: string;
  partyNumber: number;
  partyName: string;
  federation: string | null;
  coalition: string | null;
  photoUrl: string | null;
  sourceArchiveUrl: string | null;
  sourceExtractedAt: string;
  checkedAt: string;
  assetTotalCents: string | null;
  assetCount: number;
  finance: PublicCandidateFinance | null;
  hasPhoto: boolean;
  hasSocial: boolean;
  hasGovernmentPlan: boolean;
  hasCertificates: boolean;
  hasFinance: boolean;
  hasConfirmedLawmaker: boolean;
  projectCount: number;
  voteCount: number;
}

export interface PublicCandidatePage {
  items: PublicCandidateCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PublicCandidateAsset {
  category: string;
  description: string | null;
  valueCents: string;
  sourceArchiveUrl: string | null;
  sourceExtractedAt: string;
  checkedAt: string;
}

export interface PublicCandidateLink {
  label: string;
  url: string;
}

export interface PublicCandidateDocument extends PublicCandidateLink {
  kind: "government_plan" | "certificate";
  availableLocally: boolean;
  originalFilename: string | null;
  sourceArchiveUrl: string | null;
  sourceExtractedAt: string | null;
  checkedAt: string;
}

export interface PublicConfirmedCandidateHistory {
  lawmakers: Array<{
    source: CandidateLawmakerHouse;
    externalId: string;
    name: string;
    electoralName: string;
    role: "deputado_federal" | "senador";
    active: boolean;
    officialUrl: string;
  }>;
  projectCount: number;
  voteCount: number;
  topics: string[];
}

export interface PublicCandidateDetail extends PublicCandidateCard {
  seekingReelection: boolean;
  birthDate: string | null;
  ageAtInauguration: number | null;
  gender: string | null;
  race: string | null;
  education: string | null;
  occupation: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  birthRegion: string | null;
  birthCity: string | null;
  officialUrl: string;
  assets: PublicCandidateAsset[];
  assetCategories: Array<{ category: string; valueCents: string; count: number }>;
  socialLinks: PublicCandidateLink[];
  documents: PublicCandidateDocument[];
  history: PublicConfirmedCandidateHistory | null;
}
