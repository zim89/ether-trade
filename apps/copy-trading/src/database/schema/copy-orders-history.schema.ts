import { numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { copySubscriptions } from './copy-subscriptions.schema';

export const copyOrdersHistory = pgTable(
  'copy_orders_history',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => copySubscriptions.id),
    masterTradeId: uuid('master_trade_id').notNull(),
    followerOrderId: uuid('follower_order_id'), // null on failure before order creation or when SKIPPED
    pair: varchar('pair', { length: 20 }).notNull(), // BTC_USDT, ETH_USDT
    masterSide: varchar('master_side', { length: 8 }).notNull(), // BUY, SELL
    replicatedQuantity: numeric('replicated_quantity', {
      precision: 28,
      scale: 8,
    }).notNull(),
    replicatedPrice: numeric('replicated_price', {
      precision: 28,
      scale: 8,
    }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('COMPLETED'), // PENDING, COMPLETED, FAILED, SKIPPED
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_copy_orders_history_sub_trade').on(table.subscriptionId, table.masterTradeId),
  ],
);

export type CopyOrderHistory = typeof copyOrdersHistory.$inferSelect;
export type NewCopyOrderHistory = typeof copyOrdersHistory.$inferInsert;
