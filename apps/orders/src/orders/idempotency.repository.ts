import { Injectable, Inject } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import {
  idempotencyRecords,
  IdempotencyRecord,
  NewIdempotencyRecord,
} from '../database/schema/idempotency-records.schema';

export const IDEMPOTENCY_STATUS = {
  inProgress: 'IN_PROGRESS',
  completed: 'COMPLETED',
  failed: 'FAILED',
} as const;

export type IdempotencyStatus = (typeof IDEMPOTENCY_STATUS)[keyof typeof IDEMPOTENCY_STATUS];

@Injectable()
export class IdempotencyRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Finds an active idempotency record within its validity window.
   */
  async findRecord(
    userId: string,
    operation: string,
    key: string,
  ): Promise<IdempotencyRecord | null> {
    const [record] = await this.db
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.userId, userId),
          eq(idempotencyRecords.operation, operation),
          eq(idempotencyRecords.key, key),
          gt(idempotencyRecords.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return record ?? null;
  }

  /**
   * Creates an IN_PROGRESS idempotency lock record.
   */
  async createRecord(record: NewIdempotencyRecord, tx?: DrizzleDB): Promise<IdempotencyRecord> {
    const dbClient = tx ?? this.db;
    const [created] = await dbClient.insert(idempotencyRecords).values(record).returning();
    return created;
  }

  /**
   * Marks idempotency record as COMPLETED and caches the response payload.
   */
  async completeRecord(recordId: string, responsePayload: unknown, tx?: DrizzleDB): Promise<void> {
    const dbClient = tx ?? this.db;
    await dbClient
      .update(idempotencyRecords)
      .set({
        status: IDEMPOTENCY_STATUS.completed,
        responsePayload,
      })
      .where(eq(idempotencyRecords.id, recordId));
  }

  /**
   * Marks idempotency record as FAILED.
   */
  async failRecord(recordId: string, tx?: DrizzleDB): Promise<void> {
    const dbClient = tx ?? this.db;
    await dbClient
      .update(idempotencyRecords)
      .set({
        status: IDEMPOTENCY_STATUS.failed,
      })
      .where(eq(idempotencyRecords.id, recordId));
  }
}
