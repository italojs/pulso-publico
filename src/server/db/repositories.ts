import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { AlertRepository } from "#/alerts/alert-repository";
import { detectAlertCandidates } from "#/alerts/detect-events";
import {
  classifySimplifiedStage,
  classifyVoteResult,
  parseProposalIdentity,
} from "#/domain/bill-facets";

import type {
  Bill,
  BillAuthor,
  BillTopic,
  IndividualVote,
  Lawmaker,
  LegislativeSourceName,
  Movement,
  VoteEvent,
} from "#/domain/legislative";
import {
  billAuthors,
  bills,
  billTopics,
  followedBills,
  individualVotes,
  lawmakers,
  movements,
  sourceHealth,
  syncCheckpoints,
  voteEvents,
} from "#/server/db/schema";
import * as schema from "#/server/db/schema";

export interface BillGraph {
  bill: Bill;
  authors: BillAuthor[];
  topics: BillTopic[];
  movements: Movement[];
  voteEvents: VoteEvent[];
  individualVotes: IndividualVote[];
}

type Database = PostgresJsDatabase<typeof schema>;

function date(value: string) {
  return new Date(value);
}

function nullableDate(value: string | null) {
  return value ? date(value) : null;
}

function boundedErrorCode(value: string) {
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : "UNKNOWN";
}

function billValues(bill: Bill) {
  return {
    source: bill.source,
    externalId: bill.externalId,
    officialCode: bill.officialCode,
    ...parseProposalIdentity(bill.officialCode),
    congressionalKey: bill.congressionalKey,
    officialTitle: bill.officialTitle,
    officialSummary: bill.officialSummary,
    originHouse: bill.originHouse,
    currentHouse: bill.currentHouse,
    statusCode: bill.statusCode,
    statusLabel: bill.statusLabel,
    simplifiedStage: classifySimplifiedStage(bill.statusLabel),
    officialUrl: bill.officialUrl,
    presentedAt: nullableDate(bill.presentedAt),
    checkedAt: date(bill.checkedAt),
  };
}

function lawmakerValues(lawmaker: Lawmaker) {
  return {
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
    checkedAt: date(lawmaker.checkedAt),
  };
}

export class LegislativeRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  async upsertBillGraph(graph: BillGraph): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [previousBill] = await transaction
        .select({ id: bills.id, statusLabel: bills.statusLabel })
        .from(bills)
        .where(and(eq(bills.source, graph.bill.source), eq(bills.externalId, graph.bill.externalId)))
        .limit(1);
      const movementIds = graph.movements.map((item) => item.externalId);
      const voteIds = graph.voteEvents.map((item) => item.externalId);
      const [knownMovementRows, knownVoteRows] = previousBill
        ? await Promise.all([
            movementIds.length > 0
              ? transaction
                  .select({ externalId: movements.externalId })
                  .from(movements)
                  .where(and(eq(movements.source, graph.bill.source), inArray(movements.externalId, movementIds)))
              : Promise.resolve([]),
            voteIds.length > 0
              ? transaction
                  .select({ externalId: voteEvents.externalId })
                  .from(voteEvents)
                  .where(and(eq(voteEvents.source, graph.bill.source), inArray(voteEvents.externalId, voteIds)))
              : Promise.resolve([]),
          ])
        : [[], []];
      const knownMovementIds = new Set(knownMovementRows.map((item) => item.externalId));
      const knownVoteIds = new Set(knownVoteRows.map((item) => item.externalId));
      const values = billValues(graph.bill);
      const [storedBill] = await transaction
        .insert(bills)
        .values(values)
        .onConflictDoUpdate({
          target: [bills.source, bills.externalId],
          set: { ...values, updatedAt: new Date() },
        })
        .returning({ id: bills.id });
      if (!storedBill) throw new Error("Bill upsert did not return an id");

      for (const author of graph.authors) {
        if (author.billExternalId !== graph.bill.externalId) {
          throw new Error("Author references a different bill");
        }
        let lawmakerId: string | null = null;
        if (author.lawmakerExternalId) {
          const [storedLawmaker] = await transaction
            .select({ id: lawmakers.id })
            .from(lawmakers)
            .where(
              and(
                eq(lawmakers.source, author.source),
                eq(lawmakers.externalId, author.lawmakerExternalId),
              ),
            )
            .limit(1);
          lawmakerId = storedLawmaker?.id ?? null;
        }
        const authorValues = {
          source: author.source,
          externalId: author.externalId,
          billId: storedBill.id,
          lawmakerId,
          officialName: author.officialName,
          party: author.party,
          authorKind: author.authorKind,
          isPrimary: author.isPrimary,
          officialUrl: author.officialUrl,
          checkedAt: date(author.checkedAt),
        };
        await transaction
          .insert(billAuthors)
          .values(authorValues)
          .onConflictDoUpdate({
            target: [billAuthors.source, billAuthors.externalId],
            set: { ...authorValues, updatedAt: new Date() },
          });
      }

      for (const topic of graph.topics) {
        if (topic.billExternalId !== graph.bill.externalId) {
          throw new Error("Topic references a different bill");
        }
        const topicValues = {
          source: topic.source,
          externalId: topic.externalId,
          billId: storedBill.id,
          code: topic.code,
          label: topic.label,
          officialUrl: topic.officialUrl,
          checkedAt: date(topic.checkedAt),
        };
        await transaction
          .insert(billTopics)
          .values(topicValues)
          .onConflictDoUpdate({
            target: [billTopics.source, billTopics.externalId],
            set: { ...topicValues, updatedAt: new Date() },
          });
      }

      for (const movement of graph.movements) {
        if (movement.billExternalId !== graph.bill.externalId) {
          throw new Error("Movement references a different bill");
        }
        const movementValues = {
          source: movement.source,
          externalId: movement.externalId,
          billId: storedBill.id,
          occurredAt: date(movement.occurredAt),
          sequence: movement.sequence,
          house: movement.house,
          bodyCode: movement.bodyCode,
          bodyName: movement.bodyName,
          statusCode: movement.statusCode,
          statusLabel: movement.statusLabel,
          officialDescription: movement.officialDescription,
          officialUrl: movement.officialUrl,
          checkedAt: date(movement.checkedAt),
        };
        await transaction
          .insert(movements)
          .values(movementValues)
          .onConflictDoUpdate({
            target: [movements.source, movements.externalId],
            set: { ...movementValues, updatedAt: new Date() },
          });
      }

      const storedVoteIds = new Map<string, string>();
      for (const voteEvent of graph.voteEvents) {
        if (voteEvent.billExternalId !== graph.bill.externalId) {
          throw new Error("Vote event references a different bill");
        }
        const voteValues = {
          source: voteEvent.source,
          externalId: voteEvent.externalId,
          billId: storedBill.id,
          occurredAt: date(voteEvent.occurredAt),
          house: voteEvent.house,
          description: voteEvent.description,
          result: voteEvent.result,
          resultCategory: classifyVoteResult(voteEvent.result),
          isNominal: voteEvent.isNominal,
          isSecret: voteEvent.isSecret,
          officialUrl: voteEvent.officialUrl,
          checkedAt: date(voteEvent.checkedAt),
        };
        const [storedVote] = await transaction
          .insert(voteEvents)
          .values(voteValues)
          .onConflictDoUpdate({
            target: [voteEvents.source, voteEvents.externalId],
            set: { ...voteValues, updatedAt: new Date() },
          })
          .returning({ id: voteEvents.id });
        if (!storedVote) throw new Error("Vote event upsert did not return an id");
        storedVoteIds.set(voteEvent.externalId, storedVote.id);
      }

      for (const individualVote of graph.individualVotes) {
        let voteEventId = storedVoteIds.get(individualVote.voteEventExternalId);
        if (!voteEventId) {
          const [storedVote] = await transaction
            .select({ id: voteEvents.id })
            .from(voteEvents)
            .where(
              and(
                eq(voteEvents.source, individualVote.source),
                eq(voteEvents.externalId, individualVote.voteEventExternalId),
              ),
            )
            .limit(1);
          voteEventId = storedVote?.id;
        }
        if (!voteEventId) throw new Error("Individual vote references an absent vote event");

        const [storedLawmaker] = await transaction
          .select({ id: lawmakers.id })
          .from(lawmakers)
          .where(
            and(
              eq(lawmakers.source, individualVote.source),
              eq(lawmakers.externalId, individualVote.lawmakerExternalId),
            ),
          )
          .limit(1);
        if (!storedLawmaker) {
          throw new Error("Individual vote references an absent lawmaker");
        }

        const individualVoteValues = {
          source: individualVote.source,
          externalId: individualVote.externalId,
          voteEventId,
          lawmakerId: storedLawmaker.id,
          choice: individualVote.choice,
          rawChoice: individualVote.rawChoice,
          officialUrl: individualVote.officialUrl,
          checkedAt: date(individualVote.checkedAt),
        };
        await transaction
          .insert(individualVotes)
          .values(individualVoteValues)
          .onConflictDoUpdate({
            target: [individualVotes.source, individualVotes.externalId],
            set: { ...individualVoteValues, updatedAt: new Date() },
          });
      }
      if (previousBill) {
        const candidates = detectAlertCandidates({
          source: graph.bill.source,
          billExternalId: graph.bill.externalId,
          officialCode: graph.bill.officialCode,
          priorStatusLabel: previousBill.statusLabel,
          currentStatusLabel: graph.bill.statusLabel,
          checkedAt: graph.bill.checkedAt,
          officialUrl: graph.bill.officialUrl,
          movements: graph.movements.filter((item) => !knownMovementIds.has(item.externalId)),
          voteEvents: graph.voteEvents.filter((item) => !knownVoteIds.has(item.externalId)),
        });
        await new AlertRepository(transaction as unknown as Database).publishForBill(storedBill.id, candidates);
      }
    });
  }

  async upsertLawmakers(items: Lawmaker[]): Promise<void> {
    await this.database.transaction(async (transaction) => {
      for (const lawmaker of items) {
        const values = lawmakerValues(lawmaker);
        await transaction
          .insert(lawmakers)
          .values(values)
          .onConflictDoUpdate({
            target: [lawmakers.source, lawmakers.externalId],
            set: { ...values, updatedAt: new Date() },
          });
      }
    });
  }

  async findMissingLawmakerExternalIds(
    source: LegislativeSourceName,
    externalIds: readonly string[],
  ): Promise<string[]> {
    const uniqueIds = [...new Set(externalIds)];
    if (uniqueIds.length === 0) return [];

    const stored = await this.database
      .select({ externalId: lawmakers.externalId })
      .from(lawmakers)
      .where(
        and(
          eq(lawmakers.source, source),
          inArray(lawmakers.externalId, uniqueIds),
        ),
      );
    const storedIds = new Set(stored.map((item) => item.externalId));
    return uniqueIds.filter((externalId) => !storedIds.has(externalId));
  }

  async listTrackedBillExternalIds(source: LegislativeSourceName): Promise<string[]> {
    const stored = await this.database
      .selectDistinct({ externalId: bills.externalId })
      .from(followedBills)
      .innerJoin(bills, eq(followedBills.billId, bills.id))
      .where(eq(bills.source, source));
    return stored.map((item) => item.externalId);
  }

  async getCheckpoint(source: LegislativeSourceName): Promise<Date | null> {
    const [checkpoint] = await this.database
      .select({ value: syncCheckpoints.checkpointAt })
      .from(syncCheckpoints)
      .where(eq(syncCheckpoints.source, source))
      .limit(1);
    return checkpoint?.value ?? null;
  }

  async saveCheckpoint(source: LegislativeSourceName, value: Date): Promise<void> {
    await this.database
      .insert(syncCheckpoints)
      .values({ source, checkpointAt: value })
      .onConflictDoUpdate({
        target: syncCheckpoints.source,
        set: { checkpointAt: value, updatedAt: new Date() },
      });
  }

  async markSourceSuccess(
    source: LegislativeSourceName,
    checkedAt: Date,
  ): Promise<void> {
    await this.database
      .insert(sourceHealth)
      .values({
        source,
        lastSuccessAt: checkedAt,
        lastErrorCode: null,
        consecutiveFailures: 0,
        checkedAt,
      })
      .onConflictDoUpdate({
        target: sourceHealth.source,
        set: {
          lastSuccessAt: checkedAt,
          lastErrorCode: null,
          consecutiveFailures: 0,
          checkedAt,
          updatedAt: new Date(),
        },
      });
  }

  async markSourceFailure(
    source: LegislativeSourceName,
    checkedAt: Date,
    errorCode: string,
  ): Promise<void> {
    const safeErrorCode = boundedErrorCode(errorCode);
    await this.database
      .insert(sourceHealth)
      .values({
        source,
        lastFailureAt: checkedAt,
        lastErrorCode: safeErrorCode,
        consecutiveFailures: 1,
        checkedAt,
      })
      .onConflictDoUpdate({
        target: sourceHealth.source,
        set: {
          lastFailureAt: checkedAt,
          lastErrorCode: safeErrorCode,
          consecutiveFailures: sql`${sourceHealth.consecutiveFailures} + 1`,
          checkedAt,
          updatedAt: new Date(),
        },
      });
  }
}
