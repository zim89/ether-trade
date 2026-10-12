CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"pair" varchar(20) NOT NULL,
	"side" varchar(10) NOT NULL,
	"type" varchar(10) NOT NULL,
	"price" numeric(28, 8) NOT NULL,
	"amount" numeric(28, 8) NOT NULL,
	"filled_amount" numeric(28, 8) DEFAULT '0' NOT NULL,
	"remaining_amount" numeric(28, 8) NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"operation" varchar(64) NOT NULL,
	"key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'IN_PROGRESS' NOT NULL,
	"response_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_orders_user_id" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_orders_pair_status" ON "orders" USING btree ("pair","status");--> statement-breakpoint
CREATE INDEX "idx_orders_idempotency_key" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_orders_idempotency_scope" ON "idempotency_records" USING btree ("user_id","operation","key");