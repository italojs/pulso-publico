CREATE TYPE "public"."legislative_house" AS ENUM('camara', 'senado', 'congresso');--> statement-breakpoint
CREATE TYPE "public"."lawmaker_role" AS ENUM('deputado_federal', 'senador');--> statement-breakpoint
CREATE TYPE "public"."legislative_source" AS ENUM('camara', 'senado');--> statement-breakpoint
CREATE TYPE "public"."vote_choice" AS ENUM('sim', 'nao', 'abstencao', 'obstrucao', 'outro', 'indisponivel');--> statement-breakpoint
CREATE TABLE "bill_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "legislative_source" NOT NULL,
	"external_id" text NOT NULL,
	"bill_id" uuid NOT NULL,
	"lawmaker_id" uuid,
	"official_name" text NOT NULL,
	"party" text,
	"author_kind" text NOT NULL,
	"is_primary" boolean NOT NULL,
	"official_url" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "legislative_source" NOT NULL,
	"external_id" text NOT NULL,
	"bill_id" uuid NOT NULL,
	"code" text,
	"label" text NOT NULL,
	"official_url" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "legislative_source" NOT NULL,
	"external_id" text NOT NULL,
	"official_code" text NOT NULL,
	"congressional_key" text,
	"official_title" text NOT NULL,
	"official_summary" text DEFAULT '' NOT NULL,
	"origin_house" "legislative_house" NOT NULL,
	"current_house" "legislative_house",
	"status_code" text,
	"status_label" text NOT NULL,
	"official_url" text NOT NULL,
	"presented_at" timestamp with time zone,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "individual_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "legislative_source" NOT NULL,
	"external_id" text NOT NULL,
	"vote_event_id" uuid NOT NULL,
	"lawmaker_id" uuid NOT NULL,
	"choice" "vote_choice" NOT NULL,
	"raw_choice" text NOT NULL,
	"official_url" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lawmakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "legislative_source" NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"electoral_name" text NOT NULL,
	"role" "lawmaker_role" NOT NULL,
	"party" text,
	"region" text,
	"photo_url" text,
	"active" boolean NOT NULL,
	"official_url" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "legislative_source" NOT NULL,
	"external_id" text NOT NULL,
	"bill_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"sequence" integer NOT NULL,
	"house" "legislative_house" NOT NULL,
	"body_code" text,
	"body_name" text,
	"status_code" text,
	"status_label" text,
	"official_description" text NOT NULL,
	"official_url" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_health" (
	"source" "legislative_source" PRIMARY KEY NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error_code" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_checkpoints" (
	"source" "legislative_source" PRIMARY KEY NOT NULL,
	"checkpoint_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vote_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "legislative_source" NOT NULL,
	"external_id" text NOT NULL,
	"bill_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"house" "legislative_house" NOT NULL,
	"description" text NOT NULL,
	"result" text,
	"is_nominal" boolean NOT NULL,
	"is_secret" boolean NOT NULL,
	"official_url" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_authors" ADD CONSTRAINT "bill_authors_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_authors" ADD CONSTRAINT "bill_authors_lawmaker_id_lawmakers_id_fk" FOREIGN KEY ("lawmaker_id") REFERENCES "public"."lawmakers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_topics" ADD CONSTRAINT "bill_topics_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_votes" ADD CONSTRAINT "individual_votes_vote_event_id_vote_events_id_fk" FOREIGN KEY ("vote_event_id") REFERENCES "public"."vote_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "individual_votes" ADD CONSTRAINT "individual_votes_lawmaker_id_lawmakers_id_fk" FOREIGN KEY ("lawmaker_id") REFERENCES "public"."lawmakers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_events" ADD CONSTRAINT "vote_events_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_authors_source_external_id_uq" ON "bill_authors" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_authors_bill_external_id_uq" ON "bill_authors" USING btree ("bill_id","external_id");--> statement-breakpoint
CREATE INDEX "bill_authors_lawmaker_id_idx" ON "bill_authors" USING btree ("lawmaker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_topics_source_external_id_uq" ON "bill_topics" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_topics_bill_external_id_uq" ON "bill_topics" USING btree ("bill_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_source_external_id_uq" ON "bills" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "bills_congressional_key_idx" ON "bills" USING btree ("congressional_key");--> statement-breakpoint
CREATE INDEX "bills_presented_at_idx" ON "bills" USING btree ("presented_at");--> statement-breakpoint
CREATE UNIQUE INDEX "individual_votes_source_external_id_uq" ON "individual_votes" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "individual_votes_event_lawmaker_uq" ON "individual_votes" USING btree ("vote_event_id","lawmaker_id");--> statement-breakpoint
CREATE INDEX "individual_votes_lawmaker_id_idx" ON "individual_votes" USING btree ("lawmaker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lawmakers_source_external_id_uq" ON "lawmakers" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "lawmakers_active_idx" ON "lawmakers" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "movements_source_external_id_uq" ON "movements" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "movements_bill_occurred_at_idx" ON "movements" USING btree ("bill_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_events_source_external_id_uq" ON "vote_events" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "vote_events_bill_occurred_at_idx" ON "vote_events" USING btree ("bill_id","occurred_at");