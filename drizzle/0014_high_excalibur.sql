CREATE TYPE "public"."ai_summary_batch_status" AS ENUM('pending', 'processing', 'completed', 'needs_review', 'failed');--> statement-breakpoint
CREATE TABLE "ai_summary_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"prompt_version" text NOT NULL,
	"rank" integer NOT NULL,
	"status" "ai_summary_batch_status" DEFAULT 'pending' NOT NULL,
	"document_hash" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_summary_batch_items_bill_version_uq" UNIQUE("bill_id","prompt_version")
);
--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD COLUMN "practical_impact" text;--> statement-breakpoint
ALTER TABLE "ai_summary_batch_items" ADD CONSTRAINT "ai_summary_batch_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_summary_batch_items_status_rank_idx" ON "ai_summary_batch_items" USING btree ("status","rank");