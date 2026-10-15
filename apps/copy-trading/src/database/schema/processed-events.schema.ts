import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const processedEvents = pgTable(
  'processed_events',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    eventId: uuid('event_id').notNull().unique(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    consumerGroup: varchar('consumer_group', { length: 64 }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('idx_copy_processed_events_processed_at').on(table.processedAt)],
);

export type ProcessedEvent = typeof processedEvents.$inferSelect;
export type NewProcessedEvent = typeof processedEvents.$inferInsert;
