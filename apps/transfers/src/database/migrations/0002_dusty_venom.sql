ALTER TABLE "outbox_events" ADD COLUMN "traceparent" varchar(128);--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "tracestate" text;