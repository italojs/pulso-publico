CREATE TABLE "ai_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"friendly_title" text NOT NULL,
	"short_description" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_summaries_bill_id_uq" ON "ai_summaries" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "ai_summaries_fingerprint_idx" ON "ai_summaries" USING btree ("source_fingerprint");