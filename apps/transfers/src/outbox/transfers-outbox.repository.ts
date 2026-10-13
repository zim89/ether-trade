import { Injectable, Inject } from '@nestjs/common';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { OutboxStatus } from '@app/contracts';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import { outboxEvents, OutboxEvent, NewOutboxEvent } from '../database/schema/outbox-events.schema';

@Injectable()
export class TransfersOutboxRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Inserts an outbox event within a transaction or connection.
   */
  async insert(event: NewOutboxEvent, tx?: DrizzleDB): Promise<OutboxEvent> {
    const client = tx ?? this.db;
    const [created] = await client.insert(outboxEvents).values(event).returning();
    return created;
  }

  /**
   * Fetches a batch of pending events using SELECT ... FOR UPDATE SKIP LOCKED.
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
   * Records a retry attempt for retryable errors.
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
   * Deletes PUBLISHED events older than cutoff date in batches.
   */
  async deletePublishedEventsOlderThan(cutoffDate: Date, limit: number): Promise<number> {
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
