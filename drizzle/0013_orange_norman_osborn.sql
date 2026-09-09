CREATE TABLE "electoral_media_blobs" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"sync_run_id" text NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_length" integer NOT NULL,
	"sha256" text NOT NULL,
	"content" "bytea" NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "electoral_media_blobs_run_published_idx" ON "electoral_media_blobs" USING btree ("sync_run_id","published");