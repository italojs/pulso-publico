import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { LegislativeSourceName } from "#/domain/legislative";
import {
  aiSummaries,
  billAuthors,
  bills,
  billTopics,
  followedBills,
  individualVotes,
  lawmakers,
  movements,
  voteEvents,
} from "#/server/db/schema";
import type * as schema from "#/server/db/schema";
import type {
  PublicAuthor,
  PublicBillCard,
  PublicBillDetail,
  PublicBillFilters,
  PublicBillOrder,
  PublicBillPage,
  PublicBillStage,
  PublicHouse,
  PublicFilterOptions,
  PublicLawmakerDetail,
  PublicVoteKind,
  PublicVoteResult,
} from "#/server/public/read-models";

type Database = PostgresJsDatabase<typeof schema>;

export interface PublicBillScope {
  userId?: string;
  anonymousBillKeys?: Array<{ source: LegislativeSourceName; externalId: string }>;
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}

function selectedValues<T>(canonical: T[] | undefined, legacy?: T): T[] {
  if (canonical && canonical.length > 0) return canonical;
  return legacy === undefined ? [] : [legacy];
}

function brazilianDateBoundary(value: string | undefined, nextDay: boolean): SQL | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== (month ?? 0) - 1
    || calendarDate.getUTCDate() !== day
  ) return undefined;
  return nextDay
    ? sql`((${value}::date + 1) AT TIME ZONE 'America/Sao_Paulo')`
    : sql`(${value}::date AT TIME ZONE 'America/Sao_Paulo')`;
}

function billConditions(filters: PublicBillFilters, scope: PublicBillScope = {}): SQL[] {
  const conditions: SQL[] = [];
  const query = filters.query?.trim();
  if (query) {
    const pattern = `%${query}%`;
    conditions.push(
      or(
        ilike(bills.officialCode, pattern),
        ilike(bills.officialTitle, pattern),
        ilike(bills.officialSummary, pattern),
      ) as SQL,
    );
  }
  const proposalTypes = selectedValues(filters.proposalTypes, filters.proposalType);
  if (proposalTypes.length > 0) conditions.push(inArray(bills.proposalType, proposalTypes));
  if (filters.proposalNumber !== undefined) conditions.push(eq(bills.proposalNumber, filters.proposalNumber));
  if (filters.yearFrom !== undefined) conditions.push(gte(bills.proposalYear, filters.yearFrom));
  if (filters.yearTo !== undefined) conditions.push(lte(bills.proposalYear, filters.yearTo));

  const sources = selectedValues(filters.sources, filters.source);
  if (sources.length > 0) conditions.push(inArray(bills.source, sources));
  if (filters.originHouses?.length) conditions.push(inArray(bills.originHouse, filters.originHouses));
  if (filters.currentHouses?.length) {
    const actualHouses = filters.currentHouses.filter(
      (house): house is Exclude<PublicHouse, "nao_informada"> => house !== "nao_informada",
    );
    const houseConditions: SQL[] = [];
    if (actualHouses.length > 0) houseConditions.push(inArray(bills.currentHouse, actualHouses));
    if (filters.currentHouses.includes("nao_informada")) houseConditions.push(isNull(bills.currentHouse));
    conditions.push(or(...houseConditions) as SQL);
  }
  if (filters.stages?.length) conditions.push(inArray(bills.simplifiedStage, filters.stages));
  const statuses = selectedValues(filters.statuses, filters.status);
  if (statuses.length > 0) conditions.push(inArray(bills.statusLabel, statuses));

  const presentedStart = brazilianDateBoundary(filters.presentedStart, false);
  const presentedEnd = brazilianDateBoundary(filters.presentedEnd, true);
  const activityStart = brazilianDateBoundary(filters.activityStart, false);
  const activityEnd = brazilianDateBoundary(filters.activityEnd, true);
  if (presentedStart) conditions.push(gte(bills.presentedAt, presentedStart));
  if (presentedEnd) conditions.push(lt(bills.presentedAt, presentedEnd));
  if (activityStart) conditions.push(gte(latestActivityExpression, activityStart));
  if (activityEnd) conditions.push(lt(latestActivityExpression, activityEnd));

  const topics = selectedValues(filters.topics, filters.topic);
  if (topics.length > 0) {
    conditions.push(sql`exists (
      select 1 from ${billTopics}
      where ${billTopics.billId} = ${bills.id}
        and ${inArray(billTopics.label, topics)}
    )`);
  }

  const authors = selectedValues(filters.authors, filters.author);
  const parties = selectedValues(filters.parties, filters.party);
  const authorConditions: SQL[] = [];
  if (authors.length > 0) authorConditions.push(inArray(billAuthors.officialName, authors));
  if (parties.length > 0) authorConditions.push(inArray(billAuthors.party, parties));
  if (filters.regions?.length) {
    const regions = filters.regions.filter((region) => region !== "nao_informada");
    const regionConditions: SQL[] = [];
    if (regions.length > 0) regionConditions.push(inArray(lawmakers.region, regions));
    if (filters.regions.includes("nao_informada")) {
      regionConditions.push(isNull(billAuthors.lawmakerId));
      regionConditions.push(isNull(lawmakers.region));
    }
    authorConditions.push(or(...regionConditions) as SQL);
  }
  if (authorConditions.length > 0) {
    conditions.push(sql`exists (
      select 1 from ${billAuthors}
      left join ${lawmakers} on ${lawmakers.id} = ${billAuthors.lawmakerId}
      where ${billAuthors.billId} = ${bills.id}
        and ${and(...authorConditions)}
    )`);
  }

  const hasVote = sql`exists (
    select 1 from ${voteEvents}
    where ${voteEvents.billId} = ${bills.id}
  )`;
  if (filters.votePresence === "with") conditions.push(hasVote);
  if (filters.votePresence === "without") conditions.push(sql`not (${hasVote})`);

  const voteConditions: SQL[] = [];
  if (filters.voteKinds?.length) {
    const kindConditions = filters.voteKinds.map((kind): SQL => {
      if (kind === "nominal") return eq(voteEvents.isNominal, true);
      if (kind === "secret") return eq(voteEvents.isSecret, true);
      return and(eq(voteEvents.isNominal, false), eq(voteEvents.isSecret, false)) as SQL;
    });
    voteConditions.push(or(...kindConditions) as SQL);
  }
  if (filters.voteResults?.length) voteConditions.push(inArray(voteEvents.resultCategory, filters.voteResults));
  if (filters.voteHouses?.length) voteConditions.push(inArray(voteEvents.house, filters.voteHouses));
  if (filters.individualVoteAvailability) {
    const hasIndividualVote = sql`exists (
      select 1 from ${individualVotes}
      where ${individualVotes.voteEventId} = ${voteEvents.id}
    )`;
    voteConditions.push(
      filters.individualVoteAvailability === "available"
        ? hasIndividualVote
        : sql`not (${hasIndividualVote})`,
    );
  }
  if (voteConditions.length > 0) {
    conditions.push(sql`exists (
      select 1 from ${voteEvents}
      where ${voteEvents.billId} = ${bills.id}
        and ${and(...voteConditions)}
    )`);
  }

  if (filters.followedOnly) {
    const followConditions: SQL[] = [];
    if (scope.userId) {
      followConditions.push(sql`exists (
        select 1 from ${followedBills}
        where ${followedBills.billId} = ${bills.id}
          and ${followedBills.userId} = ${scope.userId}
      )`);
    }
    const anonymousKeys = scope.anonymousBillKeys ?? [];
    if (anonymousKeys.length > 0) {
      followConditions.push(or(...anonymousKeys.map((key) => and(
        eq(bills.source, key.source),
        eq(bills.externalId, key.externalId),
      ) as SQL)) as SQL);
    }
    conditions.push(followConditions.length > 0 ? or(...followConditions) as SQL : sql`false`);
  }
  return conditions;
}

const latestActivityExpression = sql<Date | null>`greatest(
  (select max("movements"."occurred_at") from "movements" where "movements"."bill_id" = "bills"."id"),
  (select max("vote_events"."occurred_at") from "vote_events" where "vote_events"."bill_id" = "bills"."id"),
  ${bills.presentedAt}
)`;

const latestActivity = latestActivityExpression.as("latest_activity_at");

const movementCount = sql<number>`(
  select count(*)::integer from "movements"
  where "movements"."bill_id" = "bills"."id"
)`.as("movement_count");

const voteCount = sql<number>`(
  select count(*)::integer from "vote_events"
  where "vote_events"."bill_id" = "bills"."id"
)`.as("vote_count");

async function enrichBillRows(
  database: Database,
  rows: Array<{
    id: string;
    source: LegislativeSourceName;
    externalId: string;
    officialCode: string;
    officialTitle: string;
    officialSummary: string;
    officialUrl: string;
    statusLabel: string;
    originHouse: "camara" | "senado" | "congresso";
    currentHouse: "camara" | "senado" | "congresso" | null;
    presentedAt: Date | null;
    checkedAt: Date;
    latestActivityAt: Date | string | null;
  }>,
): Promise<PublicBillCard[]> {
  const billIds = rows.map((row) => row.id);
  if (billIds.length === 0) return [];

  const [topicRows, authorRows, summaryRows] = await Promise.all([
    database
      .select({ billId: billTopics.billId, label: billTopics.label })
      .from(billTopics)
      .where(inArray(billTopics.billId, billIds))
      .orderBy(asc(billTopics.label)),
    database
      .select({
        billId: billAuthors.billId,
        source: billAuthors.source,
        name: billAuthors.officialName,
        party: billAuthors.party,
        kind: billAuthors.authorKind,
        primary: billAuthors.isPrimary,
        lawmakerExternalId: lawmakers.externalId,
        officialUrl: billAuthors.officialUrl,
      })
      .from(billAuthors)
      .leftJoin(lawmakers, eq(billAuthors.lawmakerId, lawmakers.id))
      .where(inArray(billAuthors.billId, billIds))
      .orderBy(desc(billAuthors.isPrimary), asc(billAuthors.officialName)),
    database
      .select({
        billId: aiSummaries.billId,
        friendlyTitle: aiSummaries.friendlyTitle,
        shortDescription: aiSummaries.shortDescription,
      })
      .from(aiSummaries)
      .where(inArray(aiSummaries.billId, billIds)),
  ]);

  const topicsByBill = Map.groupBy(topicRows, (item) => item.billId);
  const authorsByBill = Map.groupBy(authorRows, (item) => item.billId);
  const summariesByBill = new Map(summaryRows.map((item) => [item.billId, item]));

  return rows.map((row) => ({
    source: row.source,
    externalId: row.externalId,
    officialCode: row.officialCode,
    officialTitle: row.officialTitle,
    officialSummary: row.officialSummary,
    officialUrl: row.officialUrl,
    statusLabel: row.statusLabel,
    originHouse: row.originHouse,
    currentHouse: row.currentHouse,
    presentedAt: row.presentedAt ? iso(row.presentedAt) : null,
    checkedAt: iso(row.checkedAt),
    latestActivityAt: row.latestActivityAt ? iso(row.latestActivityAt) : null,
    topics: (topicsByBill.get(row.id) ?? []).map((item) => item.label),
    authors: (authorsByBill.get(row.id) ?? []).map(
      (item): PublicAuthor => ({
        source: item.source,
        name: item.name,
        party: item.party,
        kind: item.kind,
        primary: item.primary,
        lawmakerExternalId: item.lawmakerExternalId,
        officialUrl: item.officialUrl,
      }),
    ),
    friendlyTitle: summariesByBill.get(row.id)?.friendlyTitle ?? null,
    shortDescription: summariesByBill.get(row.id)?.shortDescription ?? null,
  }));
}

const billSelection = {
  id: bills.id,
  source: bills.source,
  externalId: bills.externalId,
  officialCode: bills.officialCode,
  officialTitle: bills.officialTitle,
  officialSummary: bills.officialSummary,
  officialUrl: bills.officialUrl,
  statusLabel: bills.statusLabel,
  originHouse: bills.originHouse,
  currentHouse: bills.currentHouse,
  presentedAt: bills.presentedAt,
  checkedAt: bills.checkedAt,
  latestActivityAt: latestActivity,
};

const billListSelection = {
  ...billSelection,
  movementCount,
  voteCount,
};

function billOrdering(order: PublicBillOrder | undefined): SQL[] {
  if (order === "presented_asc") return [sql`${bills.presentedAt} asc nulls last`, asc(bills.id)];
  if (order === "presented_desc" || order === "presented") {
    return [sql`${bills.presentedAt} desc nulls last`, asc(bills.id)];
  }
  if (order === "most_movements") return [desc(movementCount), asc(bills.id)];
  if (order === "most_votes") return [desc(voteCount), asc(bills.id)];
  return [sql`${latestActivity} desc nulls last`, asc(bills.id)];
}

export async function countPublicBills(
  database: Database,
  filters: PublicBillFilters,
  scope: PublicBillScope = {},
): Promise<number> {
  const conditions = billConditions(filters, scope);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await database.select({ value: count() }).from(bills).where(where);
  return rows[0]?.value ?? 0;
}

export async function listPublicBills(
  database: Database,
  filters: PublicBillFilters,
  scope: PublicBillScope = {},
): Promise<PublicBillPage> {
  const page = clampInteger(filters.page, 1, 1, 100_000);
  const pageSize = clampInteger(filters.pageSize, 20, 1, 50);
  const conditions = billConditions(filters, scope);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [total, rows] = await Promise.all([
    countPublicBills(database, filters, scope),
    database
      .select(billListSelection)
      .from(bills)
      .where(where)
      .orderBy(...billOrdering(filters.order))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  return {
    items: await enrichBillRows(database, rows),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getPublicBill(
  database: Database,
  source: LegislativeSourceName,
  externalId: string,
): Promise<PublicBillDetail | null> {
  const rows = await database
    .select(billSelection)
    .from(bills)
    .where(and(eq(bills.source, source), eq(bills.externalId, externalId)))
    .limit(1);
  const cards = await enrichBillRows(database, rows);
  const card = cards[0];
  const stored = rows[0];
  if (!card || !stored) return null;

  const [timelineRows, voteRows] = await Promise.all([
    database
      .select()
      .from(movements)
      .where(eq(movements.billId, stored.id))
      .orderBy(asc(movements.occurredAt), asc(movements.sequence)),
    database
      .select()
      .from(voteEvents)
      .where(eq(voteEvents.billId, stored.id))
      .orderBy(desc(voteEvents.occurredAt)),
  ]);

  const eventIds = voteRows.map((vote) => vote.id);
  const individualRows = eventIds.length === 0
    ? []
    : await database
        .select({
          voteEventId: individualVotes.voteEventId,
          lawmakerExternalId: lawmakers.externalId,
          lawmakerName: lawmakers.electoralName,
          party: lawmakers.party,
          region: lawmakers.region,
          choice: individualVotes.choice,
          rawChoice: individualVotes.rawChoice,
          officialUrl: individualVotes.officialUrl,
        })
        .from(individualVotes)
        .innerJoin(lawmakers, eq(individualVotes.lawmakerId, lawmakers.id))
        .where(inArray(individualVotes.voteEventId, eventIds))
        .orderBy(asc(lawmakers.electoralName));
  const individualsByEvent = Map.groupBy(individualRows, (item) => item.voteEventId);

  return {
    ...card,
    timeline: timelineRows.map((item) => ({
      externalId: item.externalId,
      occurredAt: iso(item.occurredAt),
      sequence: item.sequence,
      house: item.house,
      bodyName: item.bodyName,
      statusLabel: item.statusLabel,
      description: item.officialDescription,
      officialUrl: item.officialUrl,
    })),
    voteEvents: voteRows.map((item) => ({
      externalId: item.externalId,
      occurredAt: iso(item.occurredAt),
      house: item.house,
      description: item.description,
      result: item.result,
      isNominal: item.isNominal,
      isSecret: item.isSecret,
      officialUrl: item.officialUrl,
      individualVotes: (individualsByEvent.get(item.id) ?? []).map((vote) => ({
        lawmakerExternalId: vote.lawmakerExternalId,
        lawmakerName: vote.lawmakerName,
        party: vote.party,
        region: vote.region,
        choice: vote.choice,
        rawChoice: vote.rawChoice,
        officialUrl: vote.officialUrl,
      })),
    })),
  };
}

export async function getPublicLawmaker(
  database: Database,
  source: LegislativeSourceName,
  externalId: string,
): Promise<PublicLawmakerDetail | null> {
  const [lawmaker] = await database
    .select()
    .from(lawmakers)
    .where(and(eq(lawmakers.source, source), eq(lawmakers.externalId, externalId)))
    .limit(1);
  if (!lawmaker) return null;

  const authoredRows = await database
    .select(billSelection)
    .from(billAuthors)
    .innerJoin(bills, eq(billAuthors.billId, bills.id))
    .where(eq(billAuthors.lawmakerId, lawmaker.id))
    .orderBy(sql`${latestActivity} desc nulls last`, asc(bills.id))
    .limit(20);
  const authoredBills = await enrichBillRows(database, authoredRows);

  const voteRows = await database
    .select({
      voteExternalId: voteEvents.externalId,
      billSource: bills.source,
      billExternalId: bills.externalId,
      officialCode: bills.officialCode,
      officialTitle: bills.officialTitle,
      occurredAt: voteEvents.occurredAt,
      description: voteEvents.description,
      result: voteEvents.result,
      choice: individualVotes.choice,
      rawChoice: individualVotes.rawChoice,
      officialUrl: individualVotes.officialUrl,
    })
    .from(individualVotes)
    .innerJoin(voteEvents, eq(individualVotes.voteEventId, voteEvents.id))
    .innerJoin(bills, eq(voteEvents.billId, bills.id))
    .where(eq(individualVotes.lawmakerId, lawmaker.id))
    .orderBy(desc(voteEvents.occurredAt))
    .limit(40);

  return {
    lawmaker: {
      source: lawmaker.source,
      externalId: lawmaker.externalId,
      name: lawmaker.name,
      electoralName: lawmaker.electoralName,
      role: lawmaker.role,
      party: lawmaker.party,
      region: lawmaker.region,
      photoUrl: lawmaker.photoUrl,
      active: lawmaker.active,
      officialUrl: lawmaker.officialUrl,
      checkedAt: iso(lawmaker.checkedAt),
    },
    authoredBills,
    votes: voteRows.map((vote) => ({ ...vote, occurredAt: iso(vote.occurredAt) })),
  };
}

const HOUSE_LABELS = {
  camara: "Câmara dos Deputados",
  senado: "Senado Federal",
  congresso: "Congresso Nacional",
  nao_informada: "Não informada",
} as const satisfies Record<PublicHouse, string>;

const STAGE_LABELS = {
  presented: "Apresentada",
  committees: "Em comissões",
  ready_for_vote: "Pronto para votação",
  voted: "Votada",
  sanction_or_veto: "Sanção ou veto",
  closed: "Encerrada",
  unclassified: "Fase não classificada",
} as const satisfies Record<PublicBillStage, string>;

const VOTE_KIND_LABELS = {
  nominal: "Nominal",
  secret: "Secreta",
  non_nominal: "Não nominal",
} as const satisfies Record<PublicVoteKind, string>;

const VOTE_RESULT_LABELS = {
  approved: "Aprovada",
  rejected: "Rejeitada",
  other: "Outro resultado",
  unavailable: "Resultado não informado",
} as const satisfies Record<PublicVoteResult, string>;

function labeled<T extends string>(value: T, labels: Record<T, string>) {
  return { value, label: labels[value] };
}

export async function listPublicFilterOptions(database: Database): Promise<PublicFilterOptions> {
  const [
    sourceRows,
    proposalTypeRows,
    yearRows,
    originHouseRows,
    currentHouseRows,
    stageRows,
    statusRows,
    voteShapeRows,
    voteResultRows,
    voteHouseRows,
    topicRows,
    partyRows,
    authorRows,
    regionRows,
  ] = await Promise.all([
    database.selectDistinct({ value: bills.source }).from(bills).orderBy(asc(bills.source)),
    database
      .selectDistinct({ value: bills.proposalType })
      .from(bills)
      .where(sql`${bills.proposalType} is not null`)
      .orderBy(asc(bills.proposalType)),
    database
      .selectDistinct({ value: bills.proposalYear })
      .from(bills)
      .where(sql`${bills.proposalYear} is not null`)
      .orderBy(asc(bills.proposalYear)),
    database.selectDistinct({ value: bills.originHouse }).from(bills).orderBy(asc(bills.originHouse)),
    database.selectDistinct({ value: bills.currentHouse }).from(bills).orderBy(asc(bills.currentHouse)),
    database.selectDistinct({ value: bills.simplifiedStage }).from(bills).orderBy(asc(bills.simplifiedStage)),
    database.selectDistinct({ value: bills.statusLabel }).from(bills).orderBy(asc(bills.statusLabel)),
    database
      .selectDistinct({ nominal: voteEvents.isNominal, secret: voteEvents.isSecret })
      .from(voteEvents),
    database
      .selectDistinct({ value: voteEvents.resultCategory })
      .from(voteEvents)
      .orderBy(asc(voteEvents.resultCategory)),
    database.selectDistinct({ value: voteEvents.house }).from(voteEvents).orderBy(asc(voteEvents.house)),
    database.selectDistinct({ value: billTopics.label }).from(billTopics).orderBy(asc(billTopics.label)),
    database
      .selectDistinct({ value: billAuthors.party })
      .from(billAuthors)
      .where(sql`${billAuthors.party} is not null`)
      .orderBy(asc(billAuthors.party)),
    database
      .selectDistinct({ value: billAuthors.officialName })
      .from(billAuthors)
      .orderBy(asc(billAuthors.officialName)),
    database
      .selectDistinct({ value: lawmakers.region })
      .from(billAuthors)
      .leftJoin(lawmakers, eq(billAuthors.lawmakerId, lawmakers.id))
      .orderBy(asc(lawmakers.region)),
  ]);

  const currentHouses: PublicFilterOptions["currentHouses"] = currentHouseRows.flatMap(
    (item) => item.value ? [labeled(item.value, HOUSE_LABELS)] : [],
  );
  if (currentHouseRows.some((item) => item.value === null)) {
    currentHouses.push(labeled("nao_informada", HOUSE_LABELS));
  }
  const availableVoteKinds = new Set<PublicVoteKind>();
  for (const row of voteShapeRows) {
    if (row.nominal) availableVoteKinds.add("nominal");
    if (row.secret) availableVoteKinds.add("secret");
    if (!row.nominal && !row.secret) availableVoteKinds.add("non_nominal");
  }
  const voteKindOrder: PublicVoteKind[] = ["nominal", "secret", "non_nominal"];
  const regions = regionRows.flatMap((item) => item.value ? [{ value: item.value, label: item.value }] : []);
  if (regionRows.some((item) => item.value === null)) {
    regions.push({ value: "nao_informada", label: "Não informada" });
  }

  return {
    sources: sourceRows.map((item) => item.value),
    proposalTypes: proposalTypeRows.flatMap((item) => item.value ? [item.value] : []),
    years: yearRows.flatMap((item) => item.value === null ? [] : [item.value]),
    originHouses: originHouseRows.map((item) => labeled(item.value, HOUSE_LABELS)),
    currentHouses,
    stages: stageRows.map((item) => labeled(item.value, STAGE_LABELS)),
    statuses: statusRows.map((item) => item.value),
    voteKinds: voteKindOrder.filter((kind) => availableVoteKinds.has(kind)).map((kind) => labeled(kind, VOTE_KIND_LABELS)),
    voteResults: voteResultRows.map((item) => labeled(item.value, VOTE_RESULT_LABELS)),
    voteHouses: voteHouseRows.map((item) => labeled(item.value, HOUSE_LABELS)),
    topics: topicRows.map((item) => item.value),
    parties: partyRows.flatMap((item) => item.value ? [item.value] : []),
    authors: authorRows.map((item) => item.value),
    regions,
  };
}
