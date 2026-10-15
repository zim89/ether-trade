import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const masterTraders = pgTable('master_traders', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  userId: uuid('user_id').notNull().unique(),
  displayName: varchar('display_name', { length: 64 }).notNull(),
  bio: text('bio'),
  totalPnl: numeric('total_pnl', { precision: 28, scale: 8 }).notNull().default('0.00000000'),
  winRate: numeric('win_rate', { precision: 5, scale: 2 }).notNull().default('0.00'),
  totalCopiers: integer('total_copiers').notNull().default(0),
  minDeposit: numeric('min_deposit', { precision: 28, scale: 8 }).notNull().default('50.00000000'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type MasterTrader = typeof masterTraders.$inferSelect;
export type NewMasterTrader = typeof masterTraders.$inferInsert;
