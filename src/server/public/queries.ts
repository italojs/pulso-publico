import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { LegislativeSourceName } from "#/domain/legislative";
import {
  aiSummaries,
  billAuthors,
  bills,
  billTopics,
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
  PublicBillPage,
  PublicFilterOptions,
  PublicLawmakerDetail,
} from "#/server/public/read-models";

type Database = PostgresJsDatabase<typeof schema>;

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}

function billConditions(filters: PublicBillFilters): SQL[] {
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
  if (filters.source) conditions.push(eq(bills.source, filters.source));
  if (filters.status) conditions.push(eq(bills.statusLabel, filters.status));
  if (filters.topic) {
    conditions.push(sql`exists (
      select 1 from ${billTopics}
      where ${billTopics.billId} = ${bills.id}
        and ${billTopics.label} = ${filters.topic}
    )`);
  }
  if (filters.party) {
    conditions.push(sql`exists (
      select 1 from ${billAuthors}
      where ${billAuthors.billId} = ${bills.id}
        and ${billAuthors.party} = ${filters.party}
    )`);
  }
  if (filters.author) {
    conditions.push(sql`exists (
      select 1 from ${billAuthors}
      where ${billAuthors.billId} = ${bills.id}
        and ${billAuthors.officialName} = ${filters.author}
    )`);
  }
  return conditions;
}

const latestActivity = sql<string>`greatest(
  coalesce((select max("movements"."occurred_at") from "movements" where "movements"."bill_id" = "bills"."id"), '-infinity'::timestamptz),
  coalesce((select max("vote_events"."occurred_at") from "vote_events" where "vote_events"."bill_id" = "bills"."id"), '-infinity'::timestamptz),
  coalesce(${bills.presentedAt}, ${bills.updatedAt})
)`.as("latest_activity_at");

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
    latestActivityAt: Date | string;
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
    latestActivityAt: iso(row.latestActivityAt),
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

export async function listPublicBills(
  database: Database,
  filters: PublicBillFilters,
): Promise<PublicBillPage> {
  const page = clampInteger(filters.page, 1, 1, 100_000);
  const pageSize = clampInteger(filters.pageSize, 20, 1, 50);
  const conditions = billConditions(filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRows, rows] = await Promise.all([
    database.select({ value: count() }).from(bills).where(where),
    database
      .select(billSelection)
      .from(bills)
      .where(where)
      .orderBy(filters.order === "presented" ? desc(bills.presentedAt) : desc(latestActivity))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  const total = countRows[0]?.value ?? 0;

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
    .orderBy(desc(latestActivity))
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

export async function listPublicFilterOptions(database: Database): Promise<PublicFilterOptions> {
  const [sourceRows, statusRows, topicRows, partyRows, authorRows] = await Promise.all([
    database.selectDistinct({ value: bills.source }).from(bills).orderBy(asc(bills.source)),
    database.selectDistinct({ value: bills.statusLabel }).from(bills).orderBy(asc(bills.statusLabel)),
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
  ]);

  return {
    sources: sourceRows.map((item) => item.value),
    statuses: statusRows.map((item) => item.value),
    topics: topicRows.map((item) => item.value),
    parties: partyRows.flatMap((item) => item.value ? [item.value] : []),
    authors: authorRows.map((item) => item.value),
  };
}
