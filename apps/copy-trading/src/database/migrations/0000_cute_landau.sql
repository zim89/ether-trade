CREATE TABLE "master_traders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" varchar(64) NOT NULL,
	"bio" text,
	"total_pnl" numeric(28, 8) DEFAULT '0.00000000' NOT NULL,
	"win_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"total_copiers" integer DEFAULT 0 NOT NULL,
	"min_deposit" numeric(28, 8) DEFAULT '50.00000000' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_traders_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "copy_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"follower_user_id" uuid NOT NULL,
	"master_id" uuid NOT NULL,
	"allocated_balance" numeric(28, 8) NOT NULL,
	"max_slippage_percent" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_orders_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"master_trade_id" uuid NOT NULL,
	"follower_order_id" uuid,
	"pair" varchar(20) NOT NULL,
	"master_side" varchar(8) NOT NULL,
	"replicated_quantity" numeric(28, 8) NOT NULL,
	"replicated_price" numeric(28, 8) NOT NULL,
	"status" varchar(32) DEFAULT 'COMPLETED' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"consumer_group" varchar(64) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "copy_subscriptions" ADD CONSTRAINT "copy_subscriptions_master_id_master_traders_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."master_traders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_orders_history" ADD CONSTRAINT "copy_orders_history_subscription_id_copy_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."copy_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_copy_subscriptions_follower_master" ON "copy_subscriptions" USING btree ("follower_user_id","master_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_copy_orders_history_sub_trade" ON "copy_orders_history" USING btree ("subscription_id","master_trade_id");--> statement-breakpoint
CREATE INDEX "idx_copy_processed_events_processed_at" ON "processed_events" USING btree ("processed_at");