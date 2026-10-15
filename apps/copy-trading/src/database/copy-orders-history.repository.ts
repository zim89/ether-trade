import { Injectable, Inject } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE_CLIENT } from './database.constants';
import type { DrizzleDB } from './database.module';
import {
  copyOrdersHistory,
  CopyOrderHistory,
  NewCopyOrderHistory,
} from './schema/copy-orders-history.schema';

@Injectable()
export class CopyOrdersHistoryRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  async create(record: NewCopyOrderHistory, tx?: DrizzleDB): Promise<CopyOrderHistory | null> {
    const client = tx ?? this.db;
    const [created] = await client
      .insert(copyOrdersHistory)
      .values(record)
      .onConflictDoNothing()
      .returning();

    return created ?? null;
  }

  async findBySubscriptionAndTrade(
    subscriptionId: string,
    masterTradeId: string,
    tx?: DrizzleDB,
  ): Promise<CopyOrderHistory | null> {
    const client = tx ?? this.db;
    const [result] = await client
      .select()
      .from(copyOrdersHistory)
      .where(
        and(
          eq(copyOrdersHistory.subscriptionId, subscriptionId),
          eq(copyOrdersHistory.masterTradeId, masterTradeId),
        ),
      )
      .limit(1);

    return result ?? null;
  }

  async findBySubscription(subscriptionId: string, tx?: DrizzleDB): Promise<CopyOrderHistory[]> {
    const client = tx ?? this.db;
    return client
      .select()
      .from(copyOrdersHistory)
      .where(eq(copyOrdersHistory.subscriptionId, subscriptionId))
      .orderBy(desc(copyOrdersHistory.createdAt));
  }
}
