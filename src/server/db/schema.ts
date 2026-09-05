import {
  bigint,
  bigserial,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
export const simplifiedStageEnum = pgEnum("simplified_stage", [
  "presented",
  "committees",
  "ready_for_vote",
  "voted",
  "sanction_or_veto",
  "closed",
  "unclassified",
]);
export const voteResultCategoryEnum = pgEnum("vote_result_category", [
  "approved",
  "rejected",
  "other",
  "unavailable",
]);
export const alertTypeEnum = pgEnum("alert_type", [
  "status_change",
  "vote_scheduled",
  "vote_result",
  "sanction_or_veto",
  "archived",
  "in_force",
]);
export const candidateOfficeEnum = pgEnum("candidate_office", [
  "presidente",
  "vice_presidente",
  "governador",
  "vice_governador",
  "senador",
  "primeiro_suplente",
  "segundo_suplente",
  "deputado_federal",
  "deputado_estadual",
  "deputado_distrital",
]);
export const candidateLawmakerLinkStatusEnum = pgEnum("candidate_lawmaker_link_status", [
  "pending",
  "confirmed",
  "rejected",
]);
export const electoralSyncStatusEnum = pgEnum("electoral_sync_status", [
  "running",
  "successful",
  "failed",
]);

export type ElectoralResourceProvenanceJson = Record<string, {
  sourceArchiveUrl: string;
  sourceExtractedAt: string | null;
  entryKindSourceExtractedAt?: Record<string, string | null>;
}>;

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: sourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    officialCode: text("official_code").notNull(),
    proposalType: text("proposal_type"),
    proposalNumber: integer("proposal_number"),
    proposalYear: integer("proposal_year"),
    congressionalKey: text("congressional_key"),
    officialTitle: text("official_title").notNull(),
    officialSummary: text("official_summary").default("").notNull(),
    originHouse: houseEnum("origin_house").notNull(),
    currentHouse: houseEnum("current_house"),
    statusCode: text("status_code"),
    statusLabel: text("status_label").notNull(),
    simplifiedStage: simplifiedStageEnum("simplified_stage").default("unclassified").notNull(),
    officialUrl: text("official_url").notNull(),
    presentedAt: timestamp("presented_at", { withTimezone: true }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("bills_source_external_id_uq").on(table.source, table.externalId),
    index("bills_congressional_key_idx").on(table.congressionalKey),
    index("bills_proposal_type_year_idx").on(table.proposalType, table.proposalYear),
    index("bills_simplified_stage_idx").on(table.simplifiedStage),
    index("bills_houses_idx").on(table.originHouse, table.currentHouse),
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
    resultCategory: voteResultCategoryEnum("result_category").default("unavailable").notNull(),
    isNominal: boolean("is_nominal").notNull(),
    isSecret: boolean("is_secret").notNull(),
    officialUrl: text("official_url").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vote_events_source_external_id_uq").on(table.source, table.externalId),
    index("vote_events_bill_occurred_at_idx").on(table.billId, table.occurredAt),
    index("vote_events_result_category_idx").on(table.resultCategory),
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

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("users_email_uq").on(table.email)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("sessions_token_hash_uq").on(table.tokenHash),
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expires_at_idx").on(table.expiresAt),
]);

export const followedBills = pgTable("followed_bills", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  alertsEnabled: boolean("alerts_enabled").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("followed_bills_user_bill_uq").on(table.userId, table.billId),
  index("followed_bills_bill_id_idx").on(table.billId),
]);

export const followedLawmakers = pgTable("followed_lawmakers", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lawmakerId: uuid("lawmaker_id").notNull().references(() => lawmakers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("followed_lawmakers_user_lawmaker_uq").on(table.userId, table.lawmakerId),
  index("followed_lawmakers_lawmaker_id_idx").on(table.lawmakerId),
]);

export const alertEvents = pgTable("alert_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  type: alertTypeEnum("type").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  title: text("title").notNull(),
  officialDescription: text("official_description").notNull(),
  officialUrl: text("official_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("alert_events_dedupe_key_uq").on(table.dedupeKey),
  index("alert_events_bill_id_idx").on(table.billId),
]);

export const userAlerts = pgTable("user_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  alertEventId: uuid("alert_event_id").notNull().references(() => alertEvents.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("user_alerts_user_event_uq").on(table.userId, table.alertEventId),
  index("user_alerts_user_created_idx").on(table.userId, table.createdAt),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("push_subscriptions_endpoint_uq").on(table.endpoint),
  index("push_subscriptions_user_id_idx").on(table.userId),
]);

export const electoralSyncRuns = pgTable("electoral_sync_runs", {
  syncRunId: text("sync_run_id").primaryKey(),
  publicationOrder: bigserial("publication_order", { mode: "bigint" }).notNull(),
  electionYear: integer("election_year").notNull(),
  status: electoralSyncStatusEnum("status").notNull(),
  payloadFingerprint: text("payload_fingerprint"),
  sourceUrl: text("source_url"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  extractedAt: timestamp("extracted_at", { withTimezone: true }),
  resourceProvenance: jsonb("resource_provenance")
    .$type<ElectoralResourceProvenanceJson>()
    .default({})
    .notNull(),
  candidateCount: integer("candidate_count").default(0).notNull(),
  assetCount: integer("asset_count").default(0).notNull(),
  campaignEntryCount: integer("campaign_entry_count").default(0).notNull(),
  socialLinkCount: integer("social_link_count").default(0).notNull(),
  governmentPlanCount: integer("government_plan_count").default(0).notNull(),
  documentCount: integer("document_count").default(0).notNull(),
  errorCode: text("error_code"),
  ...timestamps,
}, (table) => [
  unique("electoral_sync_runs_id_year_uq").on(table.syncRunId, table.electionYear),
  uniqueIndex("electoral_sync_runs_publication_order_uq").on(table.publicationOrder),
  index("electoral_sync_runs_latest_idx").on(
    table.electionYear,
    table.status,
    table.publicationOrder,
  ),
]);

export const electoralCandidates = pgTable("electoral_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  electionYear: integer("election_year").notNull(),
  externalId: text("external_id").notNull(),
  snapshotRunId: text("snapshot_run_id").notNull(),
  fullName: text("full_name").notNull(),
  ballotName: text("ballot_name").notNull(),
  socialName: text("social_name"),
  number: integer("number").notNull(),
  office: candidateOfficeEnum("office").notNull(),
  round: integer("round").notNull(),
  region: text("region").notNull(),
  electoralUnit: text("electoral_unit").notNull(),
  status: text("status").notNull(),
  statusDetail: text("status_detail"),
  partyAcronym: text("party_acronym").notNull(),
  partyNumber: integer("party_number").notNull(),
  partyName: text("party_name").notNull(),
  federation: text("federation"),
  coalition: text("coalition"),
  seekingReelection: boolean("seeking_reelection"),
  birthDate: date("birth_date"),
  ageAtInauguration: integer("age_at_inauguration"),
  gender: text("gender"),
  race: text("race"),
  education: text("education"),
  occupation: text("occupation"),
  maritalStatus: text("marital_status"),
  nationality: text("nationality"),
  birthRegion: text("birth_region"),
  birthCity: text("birth_city"),
  officialUrl: text("official_url").notNull(),
  sourceArchiveUrl: text("source_archive_url"),
  sourceExtractedAt: timestamp("source_extracted_at", { withTimezone: true }).notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  photoStorageKey: text("photo_storage_key"),
  photoSourceArchiveUrl: text("photo_source_archive_url"),
  photoOriginalFilename: text("photo_original_filename"),
  photoMimeType: text("photo_mime_type"),
  photoSourceExtractedAt: timestamp("photo_source_extracted_at", { withTimezone: true }),
  photoCheckedAt: timestamp("photo_checked_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("electoral_candidates_year_external_uq").on(table.electionYear, table.externalId),
  index("electoral_candidates_catalog_idx").on(
    table.electionYear,
    table.region,
    table.office,
    table.partyAcronym,
  ),
  index("electoral_candidates_status_idx").on(table.status),
  index("electoral_candidates_snapshot_run_idx").on(table.snapshotRunId),
  foreignKey({
    name: "electoral_candidates_snapshot_run_year_fk",
    columns: [table.snapshotRunId, table.electionYear],
    foreignColumns: [electoralSyncRuns.syncRunId, electoralSyncRuns.electionYear],
  }),
]);

export const candidateAssets = pgTable("candidate_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id").notNull().references(() => electoralCandidates.id, { onDelete: "cascade" }),
  sourceOrder: integer("source_order"),
  category: text("category").notNull(),
  description: text("description"),
  valueCents: bigint("value_cents", { mode: "bigint" }).notNull(),
  sourceArchiveUrl: text("source_archive_url"),
  sourceExtractedAt: timestamp("source_extracted_at", { withTimezone: true }).notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("candidate_assets_candidate_idx").on(table.candidateId),
  index("candidate_assets_money_idx").on(table.valueCents),
  uniqueIndex("candidate_assets_candidate_source_order_uq")
    .on(table.candidateId, table.sourceOrder)
    .where(sql`${table.sourceOrder} is not null`),
]);

export const candidateCampaignTotals = pgTable("candidate_campaign_totals", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id").notNull().references(() => electoralCandidates.id, { onDelete: "cascade" }),
  revenueCents: bigint("revenue_cents", { mode: "bigint" }),
  expenseCents: bigint("expense_cents", { mode: "bigint" }),
  balanceCents: bigint("balance_cents", { mode: "bigint" }),
  revenueByCategory: jsonb("revenue_by_category").$type<Record<string, string>>().default({}).notNull(),
  expenseByCategory: jsonb("expense_by_category").$type<Record<string, string>>().default({}).notNull(),
  sourceArchiveUrl: text("source_archive_url"),
  sourceExtractedAt: timestamp("source_extracted_at", { withTimezone: true }).notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("candidate_campaign_totals_candidate_uq").on(table.candidateId),
  index("candidate_campaign_totals_money_idx").on(table.revenueCents, table.expenseCents),
]);

export const candidateSocialLinks = pgTable("candidate_social_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id").notNull().references(() => electoralCandidates.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  sourceArchiveUrl: text("source_archive_url"),
  sourceExtractedAt: timestamp("source_extracted_at", { withTimezone: true }).notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("candidate_social_links_candidate_url_uq").on(table.candidateId, table.url),
  index("candidate_social_links_candidate_idx").on(table.candidateId),
]);

export const candidateGovernmentPlans = pgTable("candidate_government_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id").notNull().references(() => electoralCandidates.id, { onDelete: "cascade" }),
  officialUrl: text("official_url").notNull(),
  storageKey: text("storage_key"),
  sourceArchiveUrl: text("source_archive_url"),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  sourceExtractedAt: timestamp("source_extracted_at", { withTimezone: true }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("candidate_government_plans_candidate_url_uq").on(table.candidateId, table.officialUrl),
  index("candidate_government_plans_candidate_idx").on(table.candidateId),
]);

export const candidateDocuments = pgTable("candidate_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id").notNull().references(() => electoralCandidates.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  officialUrl: text("official_url").notNull(),
  storageKey: text("storage_key"),
  sourceArchiveUrl: text("source_archive_url"),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  sourceExtractedAt: timestamp("source_extracted_at", { withTimezone: true }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("candidate_documents_candidate_url_uq").on(table.candidateId, table.officialUrl),
  index("candidate_documents_candidate_idx").on(table.candidateId),
]);

export const candidateLawmakerLinks = pgTable("candidate_lawmaker_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id").notNull().references(() => electoralCandidates.id),
  lawmakerId: uuid("lawmaker_id").notNull().references(() => lawmakers.id),
  status: candidateLawmakerLinkStatusEnum("status").default("pending").notNull(),
  matchMethod: text("match_method").notNull(),
  evidenceUrl: text("evidence_url"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("candidate_lawmaker_links_candidate_lawmaker_uq").on(table.candidateId, table.lawmakerId),
  index("candidate_lawmaker_links_status_idx").on(table.status),
  index("candidate_lawmaker_links_lawmaker_idx").on(table.lawmakerId),
]);

export const followedCandidates = pgTable("followed_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  candidateId: uuid("candidate_id").notNull().references(() => electoralCandidates.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("followed_candidates_user_candidate_uq").on(table.userId, table.candidateId),
  index("followed_candidates_candidate_idx").on(table.candidateId),
]);

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
export type NewUser = typeof users.$inferInsert;
export type NewSession = typeof sessions.$inferInsert;
export type NewFollowedBill = typeof followedBills.$inferInsert;
export type NewFollowedLawmaker = typeof followedLawmakers.$inferInsert;
export type NewAlertEvent = typeof alertEvents.$inferInsert;
export type NewUserAlert = typeof userAlerts.$inferInsert;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type NewElectoralSyncRun = typeof electoralSyncRuns.$inferInsert;
export type NewElectoralCandidate = typeof electoralCandidates.$inferInsert;
export type NewCandidateAsset = typeof candidateAssets.$inferInsert;
export type NewCandidateCampaignTotal = typeof candidateCampaignTotals.$inferInsert;
export type NewCandidateSocialLink = typeof candidateSocialLinks.$inferInsert;
export type NewCandidateGovernmentPlan = typeof candidateGovernmentPlans.$inferInsert;
export type NewCandidateDocument = typeof candidateDocuments.$inferInsert;
export type NewCandidateLawmakerLink = typeof candidateLawmakerLinks.$inferInsert;
export type NewFollowedCandidate = typeof followedCandidates.$inferInsert;
