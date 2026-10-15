import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_CLIENT } from './database.constants';
import type { DrizzleDB } from './database.module';
import { processedEvents, ProcessedEvent } from './schema/processed-events.schema';

@Injectable()
export class ProcessedEventsRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  async isProcessed(eventId: string, tx?: DrizzleDB): Promise<boolean> {
    const client = tx ?? this.db;
    const [result] = await client
      .select({ id: processedEvents.id })
      .from(processedEvents)
      .where(eq(processedEvents.eventId, eventId))
      .limit(1);

    return Boolean(result);
  }

  async markProcessed(
    event: { eventId: string; eventType: string; consumerGroup: string },
    tx?: DrizzleDB,
  ): Promise<ProcessedEvent> {
    const client = tx ?? this.db;
    const [created] = await client
      .insert(processedEvents)
      .values({
        eventId: event.eventId,
        eventType: event.eventType,
        consumerGroup: event.consumerGroup,
      })
      .onConflictDoNothing()
      .returning();

    return created;
  }
}
