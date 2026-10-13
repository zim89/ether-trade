import { Injectable, Inject } from '@nestjs/common';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { OutboxStatus } from '@app/contracts';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import { outboxEvents, OutboxEvent, NewOutboxEvent } from '../database/schema/outbox-events.schema';

@Injectable()
export class OutboxRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Inserts an outbox event within a database transaction or connection.
   */
  async insert(event: NewOutboxEvent, tx?: DrizzleDB): Promise<OutboxEvent> {
    const client = tx ?? this.db;
    const [created] = await client.insert(outboxEvents).values(event).returning();
    return created;
  }

  /**
   * Inserts multiple outbox events within a transaction or connection.
   */
  async insertMany(events: NewOutboxEvent[], tx?: DrizzleDB): Promise<OutboxEvent[]> {
    if (!events.length) {
      return [];
    }
    const client = tx ?? this.db;
    return client.insert(outboxEvents).values(events).returning();
  }

  /**
   * Fetches a batch of pending events using SELECT ... FOR UPDATE SKIP LOCKED.
   * Ensures concurrent Relay workers do not process duplicate messages.
   */
  async fetchPendingBatch(batchSize: number, tx: DrizzleDB): Promise<OutboxEvent[]> {
    return tx
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.status, OutboxStatus.PENDING))
      .orderBy(outboxEvents.createdAt)
      .limit(batchSize)
      .for('update', { skipLocked: true });
  }

  /**
   * Atomically marks specified events as PUBLISHED.
   */
  async markAsPublished(ids: string[], tx?: DrizzleDB): Promise<void> {
    if (!ids.length) {
      return;
    }
    const client = tx ?? this.db;
    await client
      .update(outboxEvents)
      .set({
        status: OutboxStatus.PUBLISHED,
        updatedAt: new Date(),
      })
      .where(inArray(outboxEvents.id, ids));
  }

  /**
   * Atomically marks a single event as FAILED with error message and increments retryCount.
   */
  async markAsFailed(id: string, error: string, tx?: DrizzleDB): Promise<void> {
    const client = tx ?? this.db;
    await client
      .update(outboxEvents)
      .set({
        status: OutboxStatus.FAILED,
        lastError: error,
        retryCount: sql`${outboxEvents.retryCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(outboxEvents.id, id));
  }

  /**
   * Increments retry count and keeps in PENDING or sets lastError for retryable errors.
   */
  async recordRetryAttempt(id: string, error: string, tx?: DrizzleDB): Promise<void> {
    const client = tx ?? this.db;
    await client
      .update(outboxEvents)
      .set({
        lastError: error,
        retryCount: sql`${outboxEvents.retryCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(outboxEvents.id, id));
  }

  /**
   * Deletes PUBLISHED events older than cutoff date in batches to avoid PostgreSQL table bloat.
   */
  async deletePublishedEventsOlderThan(cutoffDate: Date, limit: number): Promise<number> {
    // We select IDs first with limit then delete to prevent massive table locking
    const subquery = this.db
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.status, OutboxStatus.PUBLISHED),
          lt(outboxEvents.createdAt, cutoffDate),
        ),
      )
      .limit(limit);

    const deleted = await this.db
      .delete(outboxEvents)
      .where(inArray(outboxEvents.id, subquery))
      .returning({ id: outboxEvents.id });

    return deleted.length;
  }
}
