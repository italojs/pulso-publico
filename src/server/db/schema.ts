import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const sourceEnum = pgEnum("legislative_source", ["camara", "senado"]);
export const houseEnum = pgEnum("legislative_house", ["camara", "senado", "congresso"]);
export const lawmakerRoleEnum = pgEnum("lawmaker_role", ["deputado_federal", "senador"]);
export const voteChoiceEnum = pgEnum("vote_choice", [
  "sim",
  "nao",
  "abstencao",
  "obstrucao",
  "outro",
  "indisponivel",
]);

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: sourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    officialCode: text("official_code").notNull(),
    congressionalKey: text("congressional_key"),
    officialTitle: text("official_title").notNull(),
    officialSummary: text("official_summary").default("").notNull(),
    originHouse: houseEnum("origin_house").notNull(),
    currentHouse: houseEnum("current_house"),
    statusCode: text("status_code"),
    statusLabel: text("status_label").notNull(),
    officialUrl: text("official_url").notNull(),
    presentedAt: timestamp("presented_at", { withTimezone: true }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("bills_source_external_id_uq").on(table.source, table.externalId),
    index("bills_congressional_key_idx").on(table.congressionalKey),
    index("bills_presented_at_idx").on(table.presentedAt),
  ],
);

export const lawmakers = pgTable(
  "lawmakers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: sourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    electoralName: text("electoral_name").notNull(),
    role: lawmakerRoleEnum("role").notNull(),
    party: text("party"),
    region: text("region"),
    photoUrl: text("photo_url"),
    active: boolean("active").notNull(),
    officialUrl: text("official_url").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lawmakers_source_external_id_uq").on(table.source, table.externalId),
    index("lawmakers_active_idx").on(table.active),
  ],
);

export const billAuthors = pgTable(
  "bill_authors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: sourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    lawmakerId: uuid("lawmaker_id").references(() => lawmakers.id),
    officialName: text("official_name").notNull(),
    party: text("party"),
    authorKind: text("author_kind").notNull(),
    isPrimary: boolean("is_primary").notNull(),
    officialUrl: text("official_url").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("bill_authors_source_external_id_uq").on(table.source, table.externalId),
    uniqueIndex("bill_authors_bill_external_id_uq").on(table.billId, table.externalId),
    index("bill_authors_lawmaker_id_idx").on(table.lawmakerId),
  ],
);

export const billTopics = pgTable(
  "bill_topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: sourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    code: text("code"),
    label: text("label").notNull(),
    officialUrl: text("official_url").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("bill_topics_source_external_id_uq").on(table.source, table.externalId),
    uniqueIndex("bill_topics_bill_external_id_uq").on(table.billId, table.externalId),
  ],
);

export const movements = pgTable(
  "movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: sourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    sequence: integer("sequence").notNull(),
    house: houseEnum("house").notNull(),
    bodyCode: text("body_code"),
    bodyName: text("body_name"),
    statusCode: text("status_code"),
    statusLabel: text("status_label"),
    officialDescription: text("official_description").notNull(),
    officialUrl: text("official_url").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("movements_source_external_id_uq").on(table.source, table.externalId),
    index("movements_bill_occurred_at_idx").on(table.billId, table.occurredAt),
  ],
);

export const voteEvents = pgTable(
  "vote_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: sourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    house: houseEnum("house").notNull(),
    description: text("description").notNull(),
    result: text("result"),
    isNominal: boolean("is_nominal").notNull(),
    isSecret: boolean("is_secret").notNull(),
    officialUrl: text("official_url").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vote_events_source_external_id_uq").on(table.source, table.externalId),
    index("vote_events_bill_occurred_at_idx").on(table.billId, table.occurredAt),
  ],
);

export const individualVotes = pgTable(
  "individual_votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: sourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    voteEventId: uuid("vote_event_id")
      .notNull()
      .references(() => voteEvents.id, { onDelete: "cascade" }),
    lawmakerId: uuid("lawmaker_id")
      .notNull()
      .references(() => lawmakers.id),
    choice: voteChoiceEnum("choice").notNull(),
    rawChoice: text("raw_choice").notNull(),
    officialUrl: text("official_url").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("individual_votes_source_external_id_uq").on(table.source, table.externalId),
    uniqueIndex("individual_votes_event_lawmaker_uq").on(table.voteEventId, table.lawmakerId),
    index("individual_votes_lawmaker_id_idx").on(table.lawmakerId),
  ],
);

export const syncCheckpoints = pgTable("sync_checkpoints", {
  source: sourceEnum("source").primaryKey(),
  checkpointAt: timestamp("checkpoint_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sourceHealth = pgTable("source_health", {
  source: sourceEnum("source").primaryKey(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiSummaries = pgTable(
  "ai_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    friendlyTitle: text("friendly_title").notNull(),
    shortDescription: text("short_description").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("ai_summaries_bill_id_uq").on(table.billId),
    index("ai_summaries_fingerprint_idx").on(table.sourceFingerprint),
  ],
);

export type NewBill = typeof bills.$inferInsert;
export type NewLawmaker = typeof lawmakers.$inferInsert;
export type NewBillAuthor = typeof billAuthors.$inferInsert;
export type NewBillTopic = typeof billTopics.$inferInsert;
export type NewMovement = typeof movements.$inferInsert;
export type NewVoteEvent = typeof voteEvents.$inferInsert;
export type NewIndividualVote = typeof individualVotes.$inferInsert;
export type NewSyncCheckpoint = typeof syncCheckpoints.$inferInsert;
export type NewSourceHealth = typeof sourceHealth.$inferInsert;
export type NewAiSummary = typeof aiSummaries.$inferInsert;
