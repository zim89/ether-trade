ALTER TYPE "public"."ledger_transaction_type" ADD VALUE 'trade_settlement';--> statement-breakpoint
CREATE TABLE "processed_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"consumer_group" varchar(64) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE INDEX "idx_processed_events_processed_at" ON "processed_events" USING btree ("processed_at");