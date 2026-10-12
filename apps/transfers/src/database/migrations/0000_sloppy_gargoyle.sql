CREATE TABLE "wallet_deposits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"tx_hash" varchar(66) NOT NULL,
	"block_number" bigint NOT NULL,
	"token_address" varchar(42),
	"currency" varchar(10) NOT NULL,
	"amount" numeric(28, 8) NOT NULL,
	"status" varchar(32) DEFAULT 'CONFIRMED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credited_at" timestamp with time zone,
	CONSTRAINT "wallet_deposits_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"destination_address" varchar(42) NOT NULL,
	"currency" varchar(10) NOT NULL,
	"amount" numeric(28, 8) NOT NULL,
	"tx_hash" varchar(66),
	"nonce" integer,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"error_message" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scanner_state" (
	"chain_id" bigint PRIMARY KEY NOT NULL,
	"last_scanned_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_wallet_deposits_user_id" ON "wallet_deposits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_wallet_deposits_block_number" ON "wallet_deposits" USING btree ("block_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_withdrawal_requests_idempotency" ON "withdrawal_requests" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_withdrawal_requests_user_status" ON "withdrawal_requests" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_withdrawal_requests_status_created" ON "withdrawal_requests" USING btree ("status","created_at");