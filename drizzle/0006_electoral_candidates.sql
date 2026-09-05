CREATE TYPE "public"."candidate_lawmaker_link_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."candidate_office" AS ENUM('presidente', 'vice_presidente', 'governador', 'vice_governador', 'senador', 'primeiro_suplente', 'segundo_suplente', 'deputado_federal', 'deputado_estadual', 'deputado_distrital');--> statement-breakpoint
CREATE TYPE "public"."electoral_sync_status" AS ENUM('running', 'successful', 'failed');--> statement-breakpoint
CREATE TABLE "candidate_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"value_cents" bigint NOT NULL,
	"source_archive_url" text,
	"source_extracted_at" timestamp with time zone NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_campaign_totals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"revenue_cents" bigint,
	"expense_cents" bigint,
	"balance_cents" bigint,
	"revenue_by_category" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expense_by_category" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_archive_url" text,
	"source_extracted_at" timestamp with time zone NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"label" text NOT NULL,
	"official_url" text NOT NULL,
	"storage_key" text,
	"source_archive_url" text,
	"original_filename" text,
	"mime_type" text,
	"source_extracted_at" timestamp with time zone,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_government_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"official_url" text NOT NULL,
	"storage_key" text,
	"source_archive_url" text,
	"original_filename" text,
	"mime_type" text,
	"source_extracted_at" timestamp with time zone,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_lawmaker_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"lawmaker_id" uuid NOT NULL,
	"status" "candidate_lawmaker_link_status" DEFAULT 'pending' NOT NULL,
	"match_method" text NOT NULL,
	"evidence_url" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_social_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"source_archive_url" text,
	"source_extracted_at" timestamp with time zone NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "electoral_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_year" integer NOT NULL,
	"external_id" text NOT NULL,
	"snapshot_run_id" text NOT NULL,
	"full_name" text NOT NULL,
	"ballot_name" text NOT NULL,
	"social_name" text,
	"number" integer NOT NULL,
	"office" "candidate_office" NOT NULL,
	"round" integer NOT NULL,
	"region" text NOT NULL,
	"electoral_unit" text NOT NULL,
	"status" text NOT NULL,
	"status_detail" text,
	"party_acronym" text NOT NULL,
	"party_number" integer NOT NULL,
	"party_name" text NOT NULL,
	"federation" text,
	"coalition" text,
	"seeking_reelection" boolean NOT NULL,
	"birth_date" date,
	"age_at_inauguration" integer,
	"gender" text,
	"race" text,
	"education" text,
	"occupation" text,
	"marital_status" text,
	"nationality" text,
	"birth_region" text,
	"birth_city" text,
	"official_url" text NOT NULL,
	"source_archive_url" text,
	"source_extracted_at" timestamp with time zone NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"photo_storage_key" text,
	"photo_source_archive_url" text,
	"photo_original_filename" text,
	"photo_mime_type" text,
	"photo_source_extracted_at" timestamp with time zone,
	"photo_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "electoral_sync_runs" (
	"sync_run_id" text PRIMARY KEY NOT NULL,
	"publication_order" bigserial NOT NULL,
	"election_year" integer NOT NULL,
	"status" "electoral_sync_status" NOT NULL,
	"payload_fingerprint" text,
	"source_url" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"extracted_at" timestamp with time zone,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"asset_count" integer DEFAULT 0 NOT NULL,
	"campaign_entry_count" integer DEFAULT 0 NOT NULL,
	"social_link_count" integer DEFAULT 0 NOT NULL,
	"government_plan_count" integer DEFAULT 0 NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "electoral_sync_runs_id_year_uq" UNIQUE("sync_run_id","election_year")
);
--> statement-breakpoint
CREATE TABLE "followed_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_assets" ADD CONSTRAINT "candidate_assets_candidate_id_electoral_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."electoral_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_campaign_totals" ADD CONSTRAINT "candidate_campaign_totals_candidate_id_electoral_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."electoral_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_candidate_id_electoral_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."electoral_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_government_plans" ADD CONSTRAINT "candidate_government_plans_candidate_id_electoral_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."electoral_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_lawmaker_links" ADD CONSTRAINT "candidate_lawmaker_links_candidate_id_electoral_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."electoral_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_lawmaker_links" ADD CONSTRAINT "candidate_lawmaker_links_lawmaker_id_lawmakers_id_fk" FOREIGN KEY ("lawmaker_id") REFERENCES "public"."lawmakers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_social_links" ADD CONSTRAINT "candidate_social_links_candidate_id_electoral_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."electoral_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electoral_candidates" ADD CONSTRAINT "electoral_candidates_snapshot_run_year_fk" FOREIGN KEY ("snapshot_run_id","election_year") REFERENCES "public"."electoral_sync_runs"("sync_run_id","election_year") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followed_candidates" ADD CONSTRAINT "followed_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followed_candidates" ADD CONSTRAINT "followed_candidates_candidate_id_electoral_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."electoral_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_assets_candidate_idx" ON "candidate_assets" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_assets_money_idx" ON "candidate_assets" USING btree ("value_cents");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_campaign_totals_candidate_uq" ON "candidate_campaign_totals" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_campaign_totals_money_idx" ON "candidate_campaign_totals" USING btree ("revenue_cents","expense_cents");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_documents_candidate_url_uq" ON "candidate_documents" USING btree ("candidate_id","official_url");--> statement-breakpoint
CREATE INDEX "candidate_documents_candidate_idx" ON "candidate_documents" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_government_plans_candidate_url_uq" ON "candidate_government_plans" USING btree ("candidate_id","official_url");--> statement-breakpoint
CREATE INDEX "candidate_government_plans_candidate_idx" ON "candidate_government_plans" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_lawmaker_links_candidate_lawmaker_uq" ON "candidate_lawmaker_links" USING btree ("candidate_id","lawmaker_id");--> statement-breakpoint
CREATE INDEX "candidate_lawmaker_links_status_idx" ON "candidate_lawmaker_links" USING btree ("status");--> statement-breakpoint
CREATE INDEX "candidate_lawmaker_links_lawmaker_idx" ON "candidate_lawmaker_links" USING btree ("lawmaker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_social_links_candidate_url_uq" ON "candidate_social_links" USING btree ("candidate_id","url");--> statement-breakpoint
CREATE INDEX "candidate_social_links_candidate_idx" ON "candidate_social_links" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "electoral_candidates_year_external_uq" ON "electoral_candidates" USING btree ("election_year","external_id");--> statement-breakpoint
CREATE INDEX "electoral_candidates_catalog_idx" ON "electoral_candidates" USING btree ("election_year","region","office","party_acronym");--> statement-breakpoint
CREATE INDEX "electoral_candidates_status_idx" ON "electoral_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "electoral_candidates_snapshot_run_idx" ON "electoral_candidates" USING btree ("snapshot_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "electoral_sync_runs_publication_order_uq" ON "electoral_sync_runs" USING btree ("publication_order");--> statement-breakpoint
CREATE INDEX "electoral_sync_runs_latest_idx" ON "electoral_sync_runs" USING btree ("election_year","status","publication_order");--> statement-breakpoint
CREATE UNIQUE INDEX "followed_candidates_user_candidate_uq" ON "followed_candidates" USING btree ("user_id","candidate_id");--> statement-breakpoint
CREATE INDEX "followed_candidates_candidate_idx" ON "followed_candidates" USING btree ("candidate_id");
