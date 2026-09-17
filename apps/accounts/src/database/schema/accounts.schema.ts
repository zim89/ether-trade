import { relations } from 'drizzle-orm';
import { pgTable, uuid, varchar, numeric, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { Currency } from '@app/common/constants';
import { ledgerTransactions } from './ledger-transactions.schema';

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    userId: uuid('user_id').notNull(),
    currency: varchar('currency', { length: 16 })
      .$type<Currency>()
      .notNull()
      .default(Currency.USDT),
    availableBalance: numeric('available_balance', { precision: 28, scale: 8 })
      .notNull()
      .default('0'),
    lockedBalance: numeric('locked_balance', { precision: 28, scale: 8 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('accounts_user_id_currency_uidx').on(table.userId, table.currency)],
);

export const accountsRelations = relations(accounts, ({ many }) => ({
  ledgerTransactions: many(ledgerTransactions),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
