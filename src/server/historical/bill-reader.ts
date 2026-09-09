import { and, asc, eq, gt } from "drizzle-orm";

import {
  BillRecord,
  type Bill,
  type LegislativeSourceName,
} from "#/domain/legislative";
import { bills } from "#/server/db/schema";
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

export class HistoricalBillReader implements HistoricalBillReaderContract {
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
      .select({
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
      })
      .from(bills)
      .where(and(...filters))
      .orderBy(asc(bills.externalId))
      .limit(input.limit);

    return rows.map((row) => ({
      cursor: row.externalId,
      bill: BillRecord.parse({
        ...row,
        presentedAt: row.presentedAt?.toISOString() ?? null,
        checkedAt: row.checkedAt.toISOString(),
      }),
    }));
  }
}
