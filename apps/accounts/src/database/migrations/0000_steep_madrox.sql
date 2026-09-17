CREATE TYPE "public"."ledger_transaction_status" AS ENUM('completed');--> statement-breakpoint
CREATE TYPE "public"."ledger_transaction_type" AS ENUM('deposit', 'lock', 'unlock');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"currency" varchar(16) DEFAULT 'USDT' NOT NULL,
	"available_balance" numeric(28, 8) DEFAULT '0' NOT NULL,
	"locked_balance" numeric(28, 8) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"currency" varchar(16) NOT NULL,
	"type" "ledger_transaction_type" NOT NULL,
	"status" "ledger_transaction_status" DEFAULT 'completed' NOT NULL,
	"amount" numeric(28, 8) NOT NULL,
	"available_delta" numeric(28, 8) NOT NULL,
	"locked_delta" numeric(28, 8) NOT NULL,
	"balance_after_available" numeric(28, 8) NOT NULL,
	"balance_after_locked" numeric(28, 8) NOT NULL,
	"idempotency_key" varchar(128),
	"reference_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_id_currency_uidx" ON "accounts" USING btree ("user_id","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_idempotency_key_uidx" ON "ledger_transactions" USING btree ("idempotency_key") WHERE "ledger_transactions"."idempotency_key" IS NOT NULL;