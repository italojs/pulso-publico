import { and, asc, eq, gt } from "drizzle-orm";

import {
  BillRecord,
  type Bill,
  type LegislativeSourceName,
  VoteEventRecord,
  type VoteEvent,
} from "#/domain/legislative";
import { bills, voteEvents } from "#/server/db/schema";
import type { Database } from "#/server/db/types";

export interface CollectionBill {
  bill: Bill;
  cursor: string;
}

export interface CollectionBillQuery {
  source: LegislativeSourceName;
  year: number;
  after: string | null;
  limit: number;
}

export interface HistoricalBillReaderContract {
  list(input: CollectionBillQuery): Promise<CollectionBill[]>;
}

export interface CollectionVoteEvent {
  bill: Bill;
  voteEvent: VoteEvent;
  cursor: string;
}

export interface HistoricalVoteReaderContract {
  listVoteEvents(input: CollectionBillQuery): Promise<CollectionVoteEvent[]>;
}

const selectedBill = {
  source: bills.source,
  externalId: bills.externalId,
  officialCode: bills.officialCode,
  proposalType: bills.proposalType,
  proposalNumber: bills.proposalNumber,
  proposalYear: bills.proposalYear,
  congressionalKey: bills.congressionalKey,
  officialTitle: bills.officialTitle,
  officialSummary: bills.officialSummary,
  originHouse: bills.originHouse,
  currentHouse: bills.currentHouse,
  statusCode: bills.statusCode,
  statusLabel: bills.statusLabel,
  officialUrl: bills.officialUrl,
  presentedAt: bills.presentedAt,
  checkedAt: bills.checkedAt,
};

type StoredBillForCollection = Pick<
  typeof bills.$inferSelect,
  | "source"
  | "externalId"
  | "officialCode"
  | "proposalType"
  | "proposalNumber"
  | "proposalYear"
  | "congressionalKey"
  | "officialTitle"
  | "officialSummary"
  | "originHouse"
  | "currentHouse"
  | "statusCode"
  | "statusLabel"
  | "officialUrl"
  | "presentedAt"
  | "checkedAt"
>;

function toBill(row: StoredBillForCollection) {
  return BillRecord.parse({
    ...row,
    presentedAt: row.presentedAt?.toISOString() ?? null,
    checkedAt: row.checkedAt.toISOString(),
  });
}

export class HistoricalBillReader implements HistoricalBillReaderContract, HistoricalVoteReaderContract {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async list(input: CollectionBillQuery): Promise<CollectionBill[]> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new RangeError("Historical bill read limit must be between 1 and 100");
    }
    const filters = [
      eq(bills.source, input.source),
      eq(bills.proposalYear, input.year),
    ];
    if (input.after !== null) filters.push(gt(bills.externalId, input.after));

    const rows = await this.database
      .select(selectedBill)
      .from(bills)
      .where(and(...filters))
      .orderBy(asc(bills.externalId))
      .limit(input.limit);

    return rows.map((row) => ({
      cursor: row.externalId,
      bill: toBill(row),
    }));
  }

  async listVoteEvents(input: CollectionBillQuery): Promise<CollectionVoteEvent[]> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new RangeError("Historical vote read limit must be between 1 and 100");
    }
    const filters = [
      eq(voteEvents.source, input.source),
      eq(bills.proposalYear, input.year),
    ];
    if (input.after !== null) filters.push(gt(voteEvents.externalId, input.after));

    const rows = await this.database
      .select({
        bill: selectedBill,
        voteEvent: {
          source: voteEvents.source,
          externalId: voteEvents.externalId,
          billExternalId: bills.externalId,
          occurredAt: voteEvents.occurredAt,
          house: voteEvents.house,
          description: voteEvents.description,
          result: voteEvents.result,
          isNominal: voteEvents.isNominal,
          isSecret: voteEvents.isSecret,
          officialUrl: voteEvents.officialUrl,
          checkedAt: voteEvents.checkedAt,
        },
      })
      .from(voteEvents)
      .innerJoin(bills, eq(voteEvents.billId, bills.id))
      .where(and(...filters))
      .orderBy(asc(voteEvents.externalId))
      .limit(input.limit);

    return rows.map((row) => ({
      cursor: row.voteEvent.externalId,
      bill: toBill(row.bill),
      voteEvent: VoteEventRecord.parse({
        ...row.voteEvent,
        occurredAt: row.voteEvent.occurredAt.toISOString(),
        checkedAt: row.voteEvent.checkedAt.toISOString(),
      }),
    }));
  }
}
