import { relations, sql } from 'drizzle-orm';
import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { Currency, LedgerTransactionType, LedgerTransactionStatus } from '@app/common/constants';
import { accounts } from './accounts.schema';

export const ledgerTransactionTypeEnum = pgEnum('ledger_transaction_type', [
  LedgerTransactionType.DEPOSIT,
  LedgerTransactionType.LOCK,
  LedgerTransactionType.UNLOCK,
]);

export const ledgerTransactionStatusEnum = pgEnum('ledger_transaction_status', [
  LedgerTransactionStatus.COMPLETED,
]);

export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').notNull(),
    currency: varchar('currency', { length: 16 }).$type<Currency>().notNull(),
    type: ledgerTransactionTypeEnum('type').notNull(),
    status: ledgerTransactionStatusEnum('status')
      .notNull()
      .default(LedgerTransactionStatus.COMPLETED),
    amount: numeric('amount', { precision: 28, scale: 8 }).notNull(),
    availableDelta: numeric('available_delta', { precision: 28, scale: 8 }).notNull(),
    lockedDelta: numeric('locked_delta', { precision: 28, scale: 8 }).notNull(),
    balanceAfterAvailable: numeric('balance_after_available', {
      precision: 28,
      scale: 8,
    }).notNull(),
    balanceAfterLocked: numeric('balance_after_locked', { precision: 28, scale: 8 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    referenceId: varchar('reference_id', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ledger_idempotency_key_uidx')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);

export const ledgerTransactionsRelations = relations(ledgerTransactions, ({ one }) => ({
  account: one(accounts, {
    fields: [ledgerTransactions.accountId],
    references: [accounts.id],
  }),
}));

export type LedgerTransaction = typeof ledgerTransactions.$inferSelect;
export type NewLedgerTransaction = typeof ledgerTransactions.$inferInsert;
