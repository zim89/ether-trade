import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { OutboxAggregateType, OutboxStatus } from '@app/contracts';

export const transfersOutboxStatusEnum = pgEnum('transfers_outbox_status', [
  OutboxStatus.PENDING,
  OutboxStatus.PUBLISHED,
  OutboxStatus.FAILED,
]);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    aggregateType: varchar('aggregate_type', { length: 32 }).$type<OutboxAggregateType>().notNull(),
    aggregateId: varchar('aggregate_id', { length: 64 }).notNull(),
    partitionKey: varchar('partition_key', { length: 64 }).notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: transfersOutboxStatusEnum('status')
      .$type<OutboxStatus>()
      .default(OutboxStatus.PENDING)
      .notNull(),
    retryCount: integer('retry_count').default(0).notNull(),
    lastError: text('last_error'),
    traceparent: varchar('traceparent', { length: 128 }),
    tracestate: text('tracestate'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_transfers_outbox_pending')
      .on(table.createdAt)
      .where(sql`"outbox_events"."status" = 'PENDING'`),
    index('idx_transfers_outbox_retention')
      .on(table.createdAt)
      .where(sql`"outbox_events"."status" = 'PUBLISHED'`),
  ],
);

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
