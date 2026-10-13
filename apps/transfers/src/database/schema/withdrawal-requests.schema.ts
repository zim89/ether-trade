import {
  pgTable,
  uuid,
  varchar,
  numeric,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { WithdrawalStatus } from '@app/contracts';

export const withdrawalRequests = pgTable(
  'withdrawal_requests',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    destinationAddress: varchar('destination_address', {
      length: 42,
    }).notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    amount: numeric('amount', { precision: 28, scale: 8 }).notNull(),
    txHash: varchar('tx_hash', { length: 66 }),
    nonce: integer('nonce'),
    status: varchar('status', { length: 20 })
      .$type<WithdrawalStatus>()
      .notNull()
      .default(WithdrawalStatus.PENDING),
    errorMessage: varchar('error_message', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('uidx_withdrawal_requests_idempotency').on(table.userId, table.idempotencyKey),
    index('idx_withdrawal_requests_user_status').on(table.userId, table.status),
    index('idx_withdrawal_requests_status_created').on(table.status, table.createdAt),
  ],
);

export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
export type NewWithdrawalRequest = typeof withdrawalRequests.$inferInsert;
