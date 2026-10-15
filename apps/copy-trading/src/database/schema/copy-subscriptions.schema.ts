import { numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { masterTraders } from './master-traders.schema';

export const copySubscriptions = pgTable(
  'copy_subscriptions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    followerUserId: uuid('follower_user_id').notNull(),
    masterId: uuid('master_id')
      .notNull()
      .references(() => masterTraders.id),
    allocatedBalance: numeric('allocated_balance', {
      precision: 28,
      scale: 8,
    }).notNull(),
    maxSlippagePercent: numeric('max_slippage_percent', {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default('1.00'),
    status: varchar('status', { length: 32 }).notNull().default('ACTIVE'), // ACTIVE, PAUSED, TERMINATED
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_copy_subscriptions_follower_master').on(table.followerUserId, table.masterId),
  ],
);

export type CopySubscription = typeof copySubscriptions.$inferSelect;
export type NewCopySubscription = typeof copySubscriptions.$inferInsert;
