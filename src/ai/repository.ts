import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { buildSummaryInput, summaryFingerprint } from "#/ai/summary";
import { aiSummaries, bills } from "#/server/db/schema";
import type * as schema from "#/server/db/schema";

type Database = PostgresJsDatabase<typeof schema>;

export class AiSummaryRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async listPending(limit: number) {
    const rows = await this.database
      .select({
        billId: bills.id,
        officialCode: bills.officialCode,
        officialTitle: bills.officialTitle,
        officialSummary: bills.officialSummary,
        storedFingerprint: aiSummaries.sourceFingerprint,
      })
      .from(bills)
      .leftJoin(aiSummaries, eq(aiSummaries.billId, bills.id))
      .limit(Math.max(limit * 10, limit));
    return rows
      .map((row) => ({ ...row, input: buildSummaryInput(row) }))
      .filter((row) => row.storedFingerprint !== summaryFingerprint(row.input))
      .slice(0, limit);
  }

  async save(billId: string, summary: {
    friendlyTitle: string;
    shortDescription: string;
    model: string;
    promptVersion: string;
    sourceFingerprint: string;
    generatedAt: Date;
  }) {
    await this.database
      .insert(aiSummaries)
      .values({ billId, ...summary })
      .onConflictDoUpdate({
        target: aiSummaries.billId,
        set: { ...summary, updatedAt: new Date() },
      });
  }
}
