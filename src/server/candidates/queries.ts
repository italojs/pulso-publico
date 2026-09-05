import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { CandidateOffice } from "#/domain/electoral";
import type { CandidateQueryScope } from "#/server/candidates/filter-contract";
import type {
  CandidateFilterOptions,
  CandidateFilters,
  CandidateFundingKind,
  CandidateOrder,
  PublicCandidateCard,
  PublicCandidateDetail,
  PublicCandidateFinance,
  PublicCandidatePage,
} from "#/server/candidates/read-models";
import {
  billAuthors,
  billTopics,
  candidateAssets,
  candidateCampaignTotals,
  candidateDocuments,
  candidateGovernmentPlans,
  candidateLawmakerLinks,
  candidateSocialLinks,
  electoralCandidates,
  electoralSyncRuns,
  followedCandidates,
  individualVotes,
  lawmakers,
} from "#/server/db/schema";
import type * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;

export class CandidateAuthRequiredError extends Error {
  readonly code = "AUTH_REQUIRED" as const;

  constructor() {
    super("Authentication is required to filter followed candidates");
    this.name = "CandidateAuthRequiredError";
  }
}

const currentSnapshot = sql`exists (
  select 1
  from ${electoralSyncRuns}
  where ${electoralSyncRuns.syncRunId} = ${electoralCandidates.snapshotRunId}
    and ${electoralSyncRuns.electionYear} = ${electoralCandidates.electionYear}
    and ${electoralSyncRuns.status} = 'successful'
    and ${electoralSyncRuns.publicationOrder} = (
      select max(latest_run.${sql.raw('"publication_order"')})
      from ${electoralSyncRuns} latest_run
      where latest_run.${sql.raw('"election_year"')} = ${electoralCandidates.electionYear}
        and latest_run.${sql.raw('"status"')} = 'successful'
    )
)`;

const assetCountExpression = sql<number>`(
  select count(*)::integer
  from ${candidateAssets}
  where ${candidateAssets.candidateId} = ${electoralCandidates.id}
)`;
const assetTotalExpression = sql<string | null>`(
  select sum(${candidateAssets.valueCents})
  from ${candidateAssets}
  where ${candidateAssets.candidateId} = ${electoralCandidates.id}
)`;
const hasSocialExpression = sql<boolean>`exists (
  select 1 from ${candidateSocialLinks}
  where ${candidateSocialLinks.candidateId} = ${electoralCandidates.id}
)`;
const hasGovernmentPlanExpression = sql<boolean>`exists (
  select 1 from ${candidateGovernmentPlans}
  where ${candidateGovernmentPlans.candidateId} = ${electoralCandidates.id}
)`;
const hasCertificatesExpression = sql<boolean>`exists (
  select 1 from ${candidateDocuments}
  where ${candidateDocuments.candidateId} = ${electoralCandidates.id}
)`;
const hasConfirmedLawmakerExpression = sql<boolean>`exists (
  select 1 from ${candidateLawmakerLinks}
  where ${candidateLawmakerLinks.candidateId} = ${electoralCandidates.id}
    and ${candidateLawmakerLinks.status} = 'confirmed'
)`;
const projectCountExpression = sql<number>`(
  select count(distinct linked_authors.${sql.raw('"bill_id"')})::integer
  from ${candidateLawmakerLinks} confirmed_links
  inner join ${billAuthors} linked_authors
    on linked_authors.${sql.raw('"lawmaker_id"')} = confirmed_links.${sql.raw('"lawmaker_id"')}
  where confirmed_links.${sql.raw('"candidate_id"')} = ${electoralCandidates.id}
    and confirmed_links.${sql.raw('"status"')} = 'confirmed'
)`;
const voteCountExpression = sql<number>`(
  select count(distinct linked_votes.${sql.raw('"id"')})::integer
  from ${candidateLawmakerLinks} confirmed_links
  inner join ${individualVotes} linked_votes
    on linked_votes.${sql.raw('"lawmaker_id"')} = confirmed_links.${sql.raw('"lawmaker_id"')}
  where confirmed_links.${sql.raw('"candidate_id"')} = ${electoralCandidates.id}
    and confirmed_links.${sql.raw('"status"')} = 'confirmed'
)`;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}

function existenceCondition(exists: SQL, expected: boolean): SQL {
  return expected ? exists : sql`not (${exists})`;
}

function correlatedExists(table: typeof candidateAssets | typeof candidateCampaignTotals): SQL {
  return sql`exists (
    select 1 from ${table}
    where ${table.candidateId} = ${electoralCandidates.id}
  )`;
}

function addMoneyRange(
  conditions: SQL[],
  column: SQLWrapper,
  minimum: bigint | undefined,
  maximum: bigint | undefined,
): void {
  if (minimum === undefined && maximum === undefined) return;
  const range: SQL[] = [];
  if (minimum !== undefined) range.push(gte(column, minimum));
  if (maximum !== undefined) range.push(lte(column, maximum));
  conditions.push(sql`exists (
    select 1 from ${candidateCampaignTotals}
    where ${candidateCampaignTotals.candidateId} = ${electoralCandidates.id}
      and ${and(...range)}
  )`);
}

const fundingLabels = {
  public: "Recursos públicos",
  private: "Recursos privados",
  own: "Recursos próprios",
} as const satisfies Record<CandidateFundingKind, string>;

function fundingPredominates(kind: CandidateFundingKind): SQL {
  const label = fundingLabels[kind];
  return sql`exists (
    select 1
    from ${candidateCampaignTotals} funding_total
    where funding_total.${sql.raw('"candidate_id"')} = ${electoralCandidates.id}
      and coalesce((funding_total.${sql.raw('"revenue_by_category"')} ->> ${label})::numeric, 0) > 0
      and not exists (
        select 1
        from jsonb_each_text(funding_total.${sql.raw('"revenue_by_category"')}) category
        where category.value::numeric
          > coalesce((funding_total.${sql.raw('"revenue_by_category"')} ->> ${label})::numeric, 0)
      )
  )`;
}

function candidateConditions(filters: CandidateFilters, scope: CandidateQueryScope = {}): SQL[] {
  if (filters.followedOnly && !scope.userId) throw new CandidateAuthRequiredError();
  const conditions: SQL[] = [currentSnapshot];
  const query = filters.query?.trim();
  if (query) {
    const pattern = `%${query}%`;
    const numeric = /^\d+$/.test(query) ? Number(query) : undefined;
    const queryConditions: SQL[] = [
      ilike(electoralCandidates.fullName, pattern),
      ilike(electoralCandidates.ballotName, pattern),
      ilike(electoralCandidates.socialName, pattern),
    ];
    if (numeric !== undefined && Number.isSafeInteger(numeric)) {
      queryConditions.push(eq(electoralCandidates.number, numeric));
    }
    conditions.push(or(...queryConditions) as SQL);
  }
  if (filters.electionYears?.length) conditions.push(inArray(electoralCandidates.electionYear, filters.electionYears));
  if (filters.offices?.length) conditions.push(inArray(electoralCandidates.office, filters.offices));
  if (filters.regions?.length) conditions.push(inArray(electoralCandidates.region, filters.regions));
  if (filters.parties?.length) conditions.push(inArray(electoralCandidates.partyAcronym, filters.parties));
  if (filters.rounds?.length) conditions.push(inArray(electoralCandidates.round, filters.rounds));
  if (filters.statuses?.length) conditions.push(inArray(electoralCandidates.status, filters.statuses));
  if (filters.federations?.length) conditions.push(inArray(electoralCandidates.federation, filters.federations));
  if (filters.coalitions?.length) conditions.push(inArray(electoralCandidates.coalition, filters.coalitions));
  if (filters.ageMin !== undefined) conditions.push(gte(electoralCandidates.ageAtInauguration, filters.ageMin));
  if (filters.ageMax !== undefined) conditions.push(lte(electoralCandidates.ageAtInauguration, filters.ageMax));
  if (filters.genders?.length) conditions.push(inArray(electoralCandidates.gender, filters.genders));
  if (filters.races?.length) conditions.push(inArray(electoralCandidates.race, filters.races));
  if (filters.educations?.length) conditions.push(inArray(electoralCandidates.education, filters.educations));
  if (filters.occupations?.length) conditions.push(inArray(electoralCandidates.occupation, filters.occupations));

  const hasAssets = correlatedExists(candidateAssets);
  if (filters.declaredAssets) conditions.push(existenceCondition(hasAssets, filters.declaredAssets === "yes"));
  if (filters.assetMinCents !== undefined || filters.assetMaxCents !== undefined) {
    const range: SQL[] = [hasAssets];
    if (filters.assetMinCents !== undefined) range.push(gte(assetTotalExpression, filters.assetMinCents));
    if (filters.assetMaxCents !== undefined) range.push(lte(assetTotalExpression, filters.assetMaxCents));
    conditions.push(and(...range) as SQL);
  }
  if (filters.assetCountMin !== undefined) conditions.push(gte(assetCountExpression, filters.assetCountMin));
  if (filters.assetCountMax !== undefined) conditions.push(lte(assetCountExpression, filters.assetCountMax));
  if (filters.assetCategories?.length) {
    conditions.push(sql`exists (
      select 1 from ${candidateAssets}
      where ${candidateAssets.candidateId} = ${electoralCandidates.id}
        and ${inArray(candidateAssets.category, filters.assetCategories)}
    )`);
  }

  addMoneyRange(conditions, candidateCampaignTotals.revenueCents, filters.revenueMinCents, filters.revenueMaxCents);
  addMoneyRange(conditions, candidateCampaignTotals.expenseCents, filters.expenseMinCents, filters.expenseMaxCents);
  addMoneyRange(conditions, candidateCampaignTotals.balanceCents, filters.balanceMinCents, filters.balanceMaxCents);
  if (filters.fundingKinds?.length) {
    conditions.push(or(...filters.fundingKinds.map(fundingPredominates)) as SQL);
  }

  if (filters.hasPhoto !== undefined) {
    conditions.push(filters.hasPhoto ? isNotNull(electoralCandidates.photoStorageKey) : isNull(electoralCandidates.photoStorageKey));
  }
  if (filters.hasSocial !== undefined) conditions.push(existenceCondition(hasSocialExpression, filters.hasSocial));
  if (filters.hasGovernmentPlan !== undefined) conditions.push(existenceCondition(hasGovernmentPlanExpression, filters.hasGovernmentPlan));
  if (filters.hasCertificates !== undefined) conditions.push(existenceCondition(hasCertificatesExpression, filters.hasCertificates));
  if (filters.hasFinance !== undefined) {
    conditions.push(existenceCondition(correlatedExists(candidateCampaignTotals), filters.hasFinance));
  }
  if (filters.hasConfirmedLawmaker !== undefined) {
    conditions.push(existenceCondition(hasConfirmedLawmakerExpression, filters.hasConfirmedLawmaker));
  }
  if (filters.lawmakerHouses?.length || filters.activeMandate !== undefined) {
    const lawmakerConditions: SQL[] = [
      eq(candidateLawmakerLinks.status, "confirmed"),
    ];
    if (filters.lawmakerHouses?.length) lawmakerConditions.push(inArray(lawmakers.source, filters.lawmakerHouses));
    if (filters.activeMandate !== undefined) lawmakerConditions.push(eq(lawmakers.active, filters.activeMandate));
    conditions.push(sql`exists (
      select 1
      from ${candidateLawmakerLinks}
      inner join ${lawmakers} on ${lawmakers.id} = ${candidateLawmakerLinks.lawmakerId}
      where ${candidateLawmakerLinks.candidateId} = ${electoralCandidates.id}
        and ${and(...lawmakerConditions)}
    )`);
  }
  if (filters.topics?.length) {
    conditions.push(sql`exists (
      select 1
      from ${candidateLawmakerLinks} topic_links
      inner join ${billAuthors} topic_authors
        on topic_authors.${sql.raw('"lawmaker_id"')} = topic_links.${sql.raw('"lawmaker_id"')}
      inner join ${billTopics} linked_topics
        on linked_topics.${sql.raw('"bill_id"')} = topic_authors.${sql.raw('"bill_id"')}
      where topic_links.${sql.raw('"candidate_id"')} = ${electoralCandidates.id}
        and topic_links.${sql.raw('"status"')} = 'confirmed'
        and linked_topics.${sql.raw('"label"')} in (${sql.join(filters.topics.map((topic) => sql`${topic}`), sql`, `)})
    )`);
  }
  if (filters.followedOnly) {
    conditions.push(sql`exists (
      select 1 from ${followedCandidates}
      where ${followedCandidates.candidateId} = ${electoralCandidates.id}
        and ${followedCandidates.userId} = ${scope.userId!}
    )`);
  }
  return conditions;
}

const cardSelection = {
  electionYear: electoralCandidates.electionYear,
  externalId: electoralCandidates.externalId,
  fullName: electoralCandidates.fullName,
  ballotName: electoralCandidates.ballotName,
  socialName: electoralCandidates.socialName,
  number: electoralCandidates.number,
  office: electoralCandidates.office,
  round: electoralCandidates.round,
  region: electoralCandidates.region,
  electoralUnit: electoralCandidates.electoralUnit,
  status: electoralCandidates.status,
  statusDetail: electoralCandidates.statusDetail,
  partyAcronym: electoralCandidates.partyAcronym,
  partyNumber: electoralCandidates.partyNumber,
  partyName: electoralCandidates.partyName,
  federation: electoralCandidates.federation,
  coalition: electoralCandidates.coalition,
  hasPhoto: sql<boolean>`${electoralCandidates.photoStorageKey} is not null`.as("has_photo"),
  sourceArchiveUrl: electoralCandidates.sourceArchiveUrl,
  sourceExtractedAt: electoralCandidates.sourceExtractedAt,
  checkedAt: electoralCandidates.checkedAt,
  assetTotalCents: assetTotalExpression.as("asset_total_cents"),
  assetCount: assetCountExpression.as("asset_count"),
  hasSocial: hasSocialExpression.as("has_social"),
  hasGovernmentPlan: hasGovernmentPlanExpression.as("has_government_plan"),
  hasCertificates: hasCertificatesExpression.as("has_certificates"),
  hasConfirmedLawmaker: hasConfirmedLawmakerExpression.as("has_confirmed_lawmaker"),
  projectCount: projectCountExpression.as("project_count"),
  voteCount: voteCountExpression.as("vote_count"),
  financeRevenueCents: candidateCampaignTotals.revenueCents,
  financeExpenseCents: candidateCampaignTotals.expenseCents,
  financeBalanceCents: candidateCampaignTotals.balanceCents,
  financeRevenueByCategory: candidateCampaignTotals.revenueByCategory,
  financeExpenseByCategory: candidateCampaignTotals.expenseByCategory,
  financeSourceArchiveUrl: candidateCampaignTotals.sourceArchiveUrl,
  financeSourceExtractedAt: candidateCampaignTotals.sourceExtractedAt,
  financeCheckedAt: candidateCampaignTotals.checkedAt,
  financeId: candidateCampaignTotals.id,
};

type CardRow = {
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
  hasPhoto: boolean;
  sourceArchiveUrl: string | null;
  sourceExtractedAt: Date;
  checkedAt: Date;
  assetTotalCents: string | bigint | null;
  assetCount: number;
  hasSocial: boolean;
  hasGovernmentPlan: boolean;
  hasCertificates: boolean;
  hasConfirmedLawmaker: boolean;
  projectCount: number;
  voteCount: number;
  financeRevenueCents: bigint | null;
  financeExpenseCents: bigint | null;
  financeBalanceCents: bigint | null;
  financeRevenueByCategory: Record<string, string> | null;
  financeExpenseByCategory: Record<string, string> | null;
  financeSourceArchiveUrl: string | null;
  financeSourceExtractedAt: Date | null;
  financeCheckedAt: Date | null;
  financeId: string | null;
};

function financeFromRow(row: CardRow): PublicCandidateFinance | null {
  if (!row.financeId || !row.financeSourceExtractedAt || !row.financeCheckedAt) return null;
  return {
    revenueCents: row.financeRevenueCents === null ? null : String(row.financeRevenueCents),
    expenseCents: row.financeExpenseCents === null ? null : String(row.financeExpenseCents),
    balanceCents: row.financeBalanceCents === null ? null : String(row.financeBalanceCents),
    revenueByCategory: row.financeRevenueByCategory ?? {},
    expenseByCategory: row.financeExpenseByCategory ?? {},
    sourceArchiveUrl: row.financeSourceArchiveUrl,
    sourceExtractedAt: iso(row.financeSourceExtractedAt),
    checkedAt: iso(row.financeCheckedAt),
  };
}

function cardFromRow(row: CardRow): PublicCandidateCard {
  return {
    electionYear: row.electionYear,
    externalId: row.externalId,
    fullName: row.fullName,
    ballotName: row.ballotName,
    socialName: row.socialName,
    number: row.number,
    office: row.office,
    round: row.round,
    region: row.region,
    electoralUnit: row.electoralUnit,
    status: row.status,
    statusDetail: row.statusDetail,
    partyAcronym: row.partyAcronym,
    partyNumber: row.partyNumber,
    partyName: row.partyName,
    federation: row.federation,
    coalition: row.coalition,
    photoUrl: row.hasPhoto
      ? `/api/candidates/media/candidate/${row.electionYear}/${encodeURIComponent(row.externalId)}/photo`
      : null,
    sourceArchiveUrl: row.sourceArchiveUrl,
    sourceExtractedAt: iso(row.sourceExtractedAt),
    checkedAt: iso(row.checkedAt),
    assetTotalCents: row.assetTotalCents === null ? null : String(row.assetTotalCents),
    assetCount: row.assetCount,
    finance: financeFromRow(row),
    hasPhoto: row.hasPhoto,
    hasSocial: row.hasSocial,
    hasGovernmentPlan: row.hasGovernmentPlan,
    hasCertificates: row.hasCertificates,
    hasFinance: row.financeId !== null,
    hasConfirmedLawmaker: row.hasConfirmedLawmaker,
    projectCount: row.projectCount,
    voteCount: row.voteCount,
  };
}

function ordering(order: CandidateOrder | undefined): SQL[] {
  if (order === "number") return [asc(electoralCandidates.number), asc(electoralCandidates.externalId)];
  if (order === "updated") return [desc(electoralCandidates.checkedAt), asc(electoralCandidates.externalId)];
  if (order === "assets_desc") return [sql`${assetTotalExpression} desc nulls last`, asc(electoralCandidates.externalId)];
  if (order === "revenue_desc") return [sql`${candidateCampaignTotals.revenueCents} desc nulls last`, asc(electoralCandidates.externalId)];
  if (order === "expenses_desc") return [sql`${candidateCampaignTotals.expenseCents} desc nulls last`, asc(electoralCandidates.externalId)];
  if (order === "projects_desc") return [desc(projectCountExpression), asc(electoralCandidates.externalId)];
  if (order === "votes_desc") return [desc(voteCountExpression), asc(electoralCandidates.externalId)];
  return [asc(electoralCandidates.ballotName), asc(electoralCandidates.externalId)];
}

export async function countCandidates(
  database: Database,
  filters: CandidateFilters,
  scope: CandidateQueryScope = {},
): Promise<number> {
  const rows = await database.select({ value: count() })
    .from(electoralCandidates)
    .where(and(...candidateConditions(filters, scope)));
  return rows[0]?.value ?? 0;
}

export async function listCandidates(
  database: Database,
  filters: CandidateFilters,
  scope: CandidateQueryScope = {},
): Promise<PublicCandidatePage> {
  const page = clampInteger(filters.page, 1, 1, 100_000);
  const pageSize = clampInteger(filters.pageSize, 20, 1, 50);
  const where = and(...candidateConditions(filters, scope));
  const [total, rows] = await Promise.all([
    countCandidates(database, filters, scope),
    database.select(cardSelection)
      .from(electoralCandidates)
      .leftJoin(candidateCampaignTotals, eq(candidateCampaignTotals.candidateId, electoralCandidates.id))
      .where(where)
      .orderBy(...ordering(filters.order))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  return {
    items: (rows as CardRow[]).map(cardFromRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

const officeLabels: Record<CandidateOffice, string> = {
  presidente: "Presidente",
  vice_presidente: "Vice-presidente",
  governador: "Governador",
  vice_governador: "Vice-governador",
  senador: "Senador",
  primeiro_suplente: "1º suplente",
  segundo_suplente: "2º suplente",
  deputado_federal: "Deputado federal",
  deputado_estadual: "Deputado estadual",
  deputado_distrital: "Deputado distrital",
};

function nonNullStrings(rows: Array<{ value: string | null }>): string[] {
  return rows.flatMap((row) => row.value === null ? [] : [row.value]);
}

export async function listCandidateFilterOptions(database: Database): Promise<CandidateFilterOptions> {
  const current = currentSnapshot;
  const [
    snapshotRows, yearRows, officeRows, regionRows, partyRows, roundRows, statusRows, federationRows, coalitionRows,
    genderRows, raceRows, educationRows, occupationRows, assetRows, campaignRows, houseRows, topicRows,
  ] = await Promise.all([
    database.select({
      electionYear: electoralSyncRuns.electionYear,
      extractedAt: electoralSyncRuns.extractedAt,
    }).from(electoralSyncRuns).where(eq(electoralSyncRuns.status, "successful"))
      .orderBy(asc(electoralSyncRuns.electionYear), desc(electoralSyncRuns.publicationOrder)),
    database.selectDistinct({ value: electoralCandidates.electionYear }).from(electoralCandidates).where(current).orderBy(asc(electoralCandidates.electionYear)),
    database.selectDistinct({ value: electoralCandidates.office }).from(electoralCandidates).where(current).orderBy(asc(electoralCandidates.office)),
    database.selectDistinct({ value: electoralCandidates.region }).from(electoralCandidates).where(current).orderBy(asc(electoralCandidates.region)),
    database.selectDistinct({ value: electoralCandidates.partyAcronym }).from(electoralCandidates).where(current).orderBy(asc(electoralCandidates.partyAcronym)),
    database.selectDistinct({ value: electoralCandidates.round }).from(electoralCandidates).where(current).orderBy(asc(electoralCandidates.round)),
    database.selectDistinct({ value: electoralCandidates.status }).from(electoralCandidates).where(current).orderBy(asc(electoralCandidates.status)),
    database.selectDistinct({ value: electoralCandidates.federation }).from(electoralCandidates).where(and(current, isNotNull(electoralCandidates.federation))).orderBy(asc(electoralCandidates.federation)),
    database.selectDistinct({ value: electoralCandidates.coalition }).from(electoralCandidates).where(and(current, isNotNull(electoralCandidates.coalition))).orderBy(asc(electoralCandidates.coalition)),
    database.selectDistinct({ value: electoralCandidates.gender }).from(electoralCandidates).where(and(current, isNotNull(electoralCandidates.gender))).orderBy(asc(electoralCandidates.gender)),
    database.selectDistinct({ value: electoralCandidates.race }).from(electoralCandidates).where(and(current, isNotNull(electoralCandidates.race))).orderBy(asc(electoralCandidates.race)),
    database.selectDistinct({ value: electoralCandidates.education }).from(electoralCandidates).where(and(current, isNotNull(electoralCandidates.education))).orderBy(asc(electoralCandidates.education)),
    database.selectDistinct({ value: electoralCandidates.occupation }).from(electoralCandidates).where(and(current, isNotNull(electoralCandidates.occupation))).orderBy(asc(electoralCandidates.occupation)),
    database.selectDistinct({ value: candidateAssets.category }).from(candidateAssets)
      .innerJoin(electoralCandidates, eq(candidateAssets.candidateId, electoralCandidates.id)).where(current).orderBy(asc(candidateAssets.category)),
    database.select({ categories: candidateCampaignTotals.revenueByCategory }).from(candidateCampaignTotals)
      .innerJoin(electoralCandidates, eq(candidateCampaignTotals.candidateId, electoralCandidates.id)).where(current),
    database.selectDistinct({ value: lawmakers.source }).from(candidateLawmakerLinks)
      .innerJoin(electoralCandidates, eq(candidateLawmakerLinks.candidateId, electoralCandidates.id))
      .innerJoin(lawmakers, eq(candidateLawmakerLinks.lawmakerId, lawmakers.id))
      .where(and(current, eq(candidateLawmakerLinks.status, "confirmed"))).orderBy(asc(lawmakers.source)),
    database.selectDistinct({ value: billTopics.label }).from(candidateLawmakerLinks)
      .innerJoin(electoralCandidates, eq(candidateLawmakerLinks.candidateId, electoralCandidates.id))
      .innerJoin(billAuthors, eq(billAuthors.lawmakerId, candidateLawmakerLinks.lawmakerId))
      .innerJoin(billTopics, eq(billTopics.billId, billAuthors.billId))
      .where(and(current, eq(candidateLawmakerLinks.status, "confirmed"))).orderBy(asc(billTopics.label)),
  ]);

  const availableFunding = new Set<CandidateFundingKind>();
  for (const row of campaignRows) {
    for (const [kind, label] of Object.entries(fundingLabels) as Array<[CandidateFundingKind, string]>) {
      if (BigInt(row.categories[label] ?? "0") > 0n) availableFunding.add(kind);
    }
  }
  const fundingOrder: CandidateFundingKind[] = ["public", "private", "own"];
  const latestSnapshots = new Map<number, Date | null>();
  for (const row of snapshotRows) {
    if (!latestSnapshots.has(row.electionYear)) latestSnapshots.set(row.electionYear, row.extractedAt);
  }

  return {
    snapshots: [...latestSnapshots].map(([electionYear, snapshotExtractedAt]) => ({
      electionYear,
      extractedAt: snapshotExtractedAt ? iso(snapshotExtractedAt) : null,
    })),
    electionYears: yearRows.map((row) => row.value),
    offices: officeRows.map((row) => ({ value: row.value, label: officeLabels[row.value] })),
    regions: regionRows.map((row) => row.value),
    parties: partyRows.map((row) => row.value),
    rounds: roundRows.map((row) => row.value),
    statuses: statusRows.map((row) => row.value),
    federations: nonNullStrings(federationRows),
    coalitions: nonNullStrings(coalitionRows),
    genders: nonNullStrings(genderRows),
    races: nonNullStrings(raceRows),
    educations: nonNullStrings(educationRows),
    occupations: nonNullStrings(occupationRows),
    assetCategories: assetRows.map((row) => row.value),
    fundingKinds: fundingOrder.filter((kind) => availableFunding.has(kind)).map((kind) => ({ value: kind, label: fundingLabels[kind] })),
    lawmakerHouses: houseRows.map((row) => ({
      value: row.value,
      label: row.value === "camara" ? "Câmara dos Deputados" : "Senado Federal",
    })),
    topics: topicRows.map((row) => row.value),
  };
}

export async function getCandidateDetail(
  database: Database,
  electionYear: number,
  externalId: string,
): Promise<PublicCandidateDetail | null> {
  const [candidateRow] = await database.select({
    id: electoralCandidates.id,
    ...cardSelection,
    seekingReelection: electoralCandidates.seekingReelection,
    birthDate: electoralCandidates.birthDate,
    ageAtInauguration: electoralCandidates.ageAtInauguration,
    gender: electoralCandidates.gender,
    race: electoralCandidates.race,
    education: electoralCandidates.education,
    occupation: electoralCandidates.occupation,
    maritalStatus: electoralCandidates.maritalStatus,
    nationality: electoralCandidates.nationality,
    birthRegion: electoralCandidates.birthRegion,
    birthCity: electoralCandidates.birthCity,
    officialUrl: electoralCandidates.officialUrl,
  }).from(electoralCandidates)
    .leftJoin(candidateCampaignTotals, eq(candidateCampaignTotals.candidateId, electoralCandidates.id))
    .where(and(
      currentSnapshot,
      eq(electoralCandidates.electionYear, electionYear),
      eq(electoralCandidates.externalId, externalId),
    )).limit(1);
  if (!candidateRow) return null;

  const [assetRows, socialRows, planRows, documentRows, lawmakerRows, topicRows] = await Promise.all([
    database.select({
      category: candidateAssets.category,
      description: candidateAssets.description,
      valueCents: candidateAssets.valueCents,
      sourceArchiveUrl: candidateAssets.sourceArchiveUrl,
      sourceExtractedAt: candidateAssets.sourceExtractedAt,
      checkedAt: candidateAssets.checkedAt,
    }).from(candidateAssets).where(eq(candidateAssets.candidateId, candidateRow.id))
      .orderBy(desc(candidateAssets.valueCents), asc(candidateAssets.id)),
    database.select({ label: candidateSocialLinks.label, url: candidateSocialLinks.url })
      .from(candidateSocialLinks).where(eq(candidateSocialLinks.candidateId, candidateRow.id))
      .orderBy(asc(candidateSocialLinks.label), asc(candidateSocialLinks.url)),
    database.select().from(candidateGovernmentPlans)
      .where(eq(candidateGovernmentPlans.candidateId, candidateRow.id)).orderBy(asc(candidateGovernmentPlans.id)),
    database.select().from(candidateDocuments)
      .where(eq(candidateDocuments.candidateId, candidateRow.id)).orderBy(asc(candidateDocuments.label), asc(candidateDocuments.id)),
    database.select({
      source: lawmakers.source,
      externalId: lawmakers.externalId,
      name: lawmakers.name,
      electoralName: lawmakers.electoralName,
      role: lawmakers.role,
      active: lawmakers.active,
      officialUrl: lawmakers.officialUrl,
    }).from(candidateLawmakerLinks)
      .innerJoin(lawmakers, eq(candidateLawmakerLinks.lawmakerId, lawmakers.id))
      .where(and(eq(candidateLawmakerLinks.candidateId, candidateRow.id), eq(candidateLawmakerLinks.status, "confirmed")))
      .orderBy(asc(lawmakers.source), asc(lawmakers.externalId)),
    database.selectDistinct({ value: billTopics.label }).from(candidateLawmakerLinks)
      .innerJoin(billAuthors, eq(billAuthors.lawmakerId, candidateLawmakerLinks.lawmakerId))
      .innerJoin(billTopics, eq(billTopics.billId, billAuthors.billId))
      .where(and(eq(candidateLawmakerLinks.candidateId, candidateRow.id), eq(candidateLawmakerLinks.status, "confirmed")))
      .orderBy(asc(billTopics.label)),
  ]);

  const categoryMap = new Map<string, { valueCents: bigint; count: number }>();
  for (const asset of assetRows) {
    const aggregate = categoryMap.get(asset.category) ?? { valueCents: 0n, count: 0 };
    aggregate.valueCents += asset.valueCents;
    aggregate.count += 1;
    categoryMap.set(asset.category, aggregate);
  }
  const card = cardFromRow(candidateRow as CardRow);
  return {
    ...card,
    seekingReelection: candidateRow.seekingReelection,
    birthDate: candidateRow.birthDate,
    ageAtInauguration: candidateRow.ageAtInauguration,
    gender: candidateRow.gender,
    race: candidateRow.race,
    education: candidateRow.education,
    occupation: candidateRow.occupation,
    maritalStatus: candidateRow.maritalStatus,
    nationality: candidateRow.nationality,
    birthRegion: candidateRow.birthRegion,
    birthCity: candidateRow.birthCity,
    officialUrl: candidateRow.officialUrl,
    assets: assetRows.map((asset) => ({
      category: asset.category,
      description: asset.description,
      valueCents: String(asset.valueCents),
      sourceArchiveUrl: asset.sourceArchiveUrl,
      sourceExtractedAt: iso(asset.sourceExtractedAt),
      checkedAt: iso(asset.checkedAt),
    })),
    assetCategories: [...categoryMap.entries()].sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
      .map(([category, aggregate]) => ({ category, valueCents: aggregate.valueCents.toString(), count: aggregate.count })),
    socialLinks: socialRows,
    documents: [
      ...planRows.map((plan) => ({
        kind: "government_plan" as const,
        label: "Proposta de governo",
        url: plan.officialUrl,
        availableLocally: plan.storageKey !== null,
        originalFilename: plan.originalFilename,
        sourceArchiveUrl: plan.sourceArchiveUrl,
        sourceExtractedAt: plan.sourceExtractedAt ? iso(plan.sourceExtractedAt) : null,
        checkedAt: iso(plan.checkedAt),
      })),
      ...documentRows.map((document) => ({
        kind: "certificate" as const,
        label: document.label,
        url: document.officialUrl,
        availableLocally: document.storageKey !== null,
        originalFilename: document.originalFilename,
        sourceArchiveUrl: document.sourceArchiveUrl,
        sourceExtractedAt: document.sourceExtractedAt ? iso(document.sourceExtractedAt) : null,
        checkedAt: iso(document.checkedAt),
      })),
    ],
    history: lawmakerRows.length === 0 ? null : {
      lawmakers: lawmakerRows,
      projectCount: card.projectCount,
      voteCount: card.voteCount,
      topics: topicRows.map((row) => row.value),
    },
  };
}
