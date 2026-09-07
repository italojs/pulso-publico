CREATE TYPE "public"."bill_hydration_status" AS ENUM('pending', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."historical_import_status" AS ENUM('running', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE "bill_hydration_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"status" "bill_hydration_status" DEFAULT 'pending' NOT NULL,
	"details_checked_at" timestamp with time zone,
	"last_requested_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_hydration_state_bill_id_uq" UNIQUE("bill_id")
);
--> statement-breakpoint
CREATE TABLE "historical_import_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "legislative_source" NOT NULL,
	"dataset" text NOT NULL,
	"year" integer NOT NULL,
	"status" "historical_import_status" NOT NULL,
	"records_read" integer DEFAULT 0 NOT NULL,
	"records_persisted" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historical_import_checkpoints_source_dataset_year_uq" UNIQUE("source","dataset","year")
);
--> statement-breakpoint
ALTER TABLE "bill_hydration_state" ADD CONSTRAINT "bill_hydration_state_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_hydration_state_status_retry_idx" ON "bill_hydration_state" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "bill_hydration_state_last_requested_idx" ON "bill_hydration_state" USING btree ("last_requested_at");--> statement-breakpoint
CREATE INDEX "historical_import_checkpoints_status_idx" ON "historical_import_checkpoints" USING btree ("status","year");