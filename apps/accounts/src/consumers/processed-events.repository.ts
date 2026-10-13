import { Injectable, Inject } from '@nestjs/common';
import { eq, inArray, lt } from 'drizzle-orm';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import {
  processedEvents,
  ProcessedEvent,
  NewProcessedEvent,
} from '../database/schema/processed-events.schema';

@Injectable()
export class ProcessedEventsRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Checks whether the event with eventId has already been recorded in processed_events.
   */
  async isEventProcessed(eventId: string, tx?: DrizzleDB): Promise<boolean> {
    const client = tx ?? this.db;
    const [result] = await client
      .select({ id: processedEvents.id })
      .from(processedEvents)
      .where(eq(processedEvents.eventId, eventId))
      .limit(1);

    return Boolean(result);
  }

  /**
   * Records that an event has been processed for deduplication.
   */
  async markEventProcessed(event: NewProcessedEvent, tx?: DrizzleDB): Promise<ProcessedEvent> {
    const client = tx ?? this.db;
    const [created] = await client.insert(processedEvents).values(event).returning();
    return created;
  }

  /**
   * Deletes processed event records older than cutoff date in batches to avoid table bloat.
   */
  async deleteOlderThan(cutoffDate: Date, limit: number): Promise<number> {
    const subquery = this.db
      .select({ id: processedEvents.id })
      .from(processedEvents)
      .where(lt(processedEvents.processedAt, cutoffDate))
      .limit(limit);

    const deleted = await this.db
      .delete(processedEvents)
      .where(inArray(processedEvents.id, subquery))
      .returning({ id: processedEvents.id });

    return deleted.length;
  }
}
