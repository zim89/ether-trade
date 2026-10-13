import { pgTable, uuid, varchar, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { OrderStatus } from '@app/contracts';

export const orders = pgTable(
  'orders',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid('user_id').notNull(),
    pair: varchar('pair', { length: 20 }).notNull(),
    side: varchar('side', { length: 10 }).notNull(),
    type: varchar('type', { length: 10 }).notNull(),
    price: numeric('price', { precision: 28, scale: 8 }).notNull(),
    amount: numeric('amount', { precision: 28, scale: 8 }).notNull(),
    filledAmount: numeric('filled_amount', { precision: 28, scale: 8 }).notNull().default('0'),
    remainingAmount: numeric('remaining_amount', { precision: 28, scale: 8 }).notNull(),
    status: varchar('status', { length: 20 })
      .$type<OrderStatus>()
      .notNull()
      .default(OrderStatus.OPEN),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_orders_user_id').on(table.userId),
    index('idx_orders_pair_status').on(table.pair, table.status),
    index('idx_orders_idempotency_key').on(table.idempotencyKey),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
