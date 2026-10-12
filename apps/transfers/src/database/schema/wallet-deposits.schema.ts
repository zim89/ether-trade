import { pgTable, uuid, varchar, numeric, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const walletDeposits = pgTable(
  'wallet_deposits',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull(),
    txHash: varchar('tx_hash', { length: 66 }).notNull().unique(),
    blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
    tokenAddress: varchar('token_address', { length: 42 }),
    currency: varchar('currency', { length: 10 }).notNull(),
    amount: numeric('amount', { precision: 28, scale: 8 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('CONFIRMED'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    creditedAt: timestamp('credited_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_wallet_deposits_user_id').on(table.userId),
    index('idx_wallet_deposits_block_number').on(table.blockNumber),
  ],
);

export type WalletDeposit = typeof walletDeposits.$inferSelect;
export type NewWalletDeposit = typeof walletDeposits.$inferInsert;
