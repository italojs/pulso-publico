CREATE TYPE "public"."historical_collection_phase" AS ENUM('catalog', 'authors_topics', 'movements', 'vote_events', 'individual_votes', 'reconcile', 'validate');--> statement-breakpoint
CREATE TYPE "public"."historical_collection_status" AS ENUM('pending', 'running', 'waiting', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE "historical_collection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" text NOT NULL,
	"status" "historical_collection_status" DEFAULT 'running' NOT NULL,
	"from_year" integer NOT NULL,
	"through_year" integer NOT NULL,
	"sources" jsonb NOT NULL,
	"records_read" integer DEFAULT 0 NOT NULL,
	"records_persisted" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historical_collection_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "legislative_source" NOT NULL,
	"year" integer NOT NULL,
	"phase" "historical_collection_phase" NOT NULL,
	"cursor" text,
	"status" "historical_collection_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"records_read" integer DEFAULT 0 NOT NULL,
	"records_persisted" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"last_error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "historical_collection_runs_status_started_idx" ON "historical_collection_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "historical_collection_tasks_source_year_phase_uq" ON "historical_collection_tasks" USING btree ("source","year","phase");--> statement-breakpoint
CREATE INDEX "historical_collection_tasks_schedule_idx" ON "historical_collection_tasks" USING btree ("status","next_attempt_at","year");--> statement-breakpoint
CREATE INDEX "historical_collection_tasks_lease_idx" ON "historical_collection_tasks" USING btree ("lease_expires_at");