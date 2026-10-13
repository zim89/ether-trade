CREATE TYPE "public"."transfers_outbox_status" AS ENUM('PENDING', 'PUBLISHED', 'FAILED');--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aggregate_type" varchar(32) NOT NULL,
	"aggregate_id" varchar(64) NOT NULL,
	"partition_key" varchar(64) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "transfers_outbox_status" DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_transfers_outbox_pending" ON "outbox_events" USING btree ("created_at") WHERE "outbox_events"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "idx_transfers_outbox_retention" ON "outbox_events" USING btree ("created_at") WHERE "outbox_events"."status" = 'PUBLISHED';