import { Injectable, Inject } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { SubscriptionStatus } from '../common/constants';
import { DRIZZLE_CLIENT } from './database.constants';
import type { DrizzleDB } from './database.module';
import { copyOrdersHistory } from './schema/copy-orders-history.schema';
import {
  copySubscriptions,
  CopySubscription,
  NewCopySubscription,
} from './schema/copy-subscriptions.schema';

@Injectable()
export class CopySubscriptionsRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  async create(newSub: NewCopySubscription, tx?: DrizzleDB): Promise<CopySubscription> {
    const client = tx ?? this.db;
    const [created] = await client.insert(copySubscriptions).values(newSub).returning();
    return created;
  }

  async findById(subscriptionId: string, tx?: DrizzleDB): Promise<CopySubscription | null> {
    const client = tx ?? this.db;
    const [result] = await client
      .select()
      .from(copySubscriptions)
      .where(eq(copySubscriptions.id, subscriptionId))
      .limit(1);

    return result ?? null;
  }

  async findByFollowerAndMaster(
    followerUserId: string,
    masterId: string,
    tx?: DrizzleDB,
  ): Promise<CopySubscription | null> {
    const client = tx ?? this.db;
    const [result] = await client
      .select()
      .from(copySubscriptions)
      .where(
        and(
          eq(copySubscriptions.followerUserId, followerUserId),
          eq(copySubscriptions.masterId, masterId),
        ),
      )
      .limit(1);

    return result ?? null;
  }

  async findByFollower(followerUserId: string, tx?: DrizzleDB): Promise<CopySubscription[]> {
    const client = tx ?? this.db;
    return client
      .select()
      .from(copySubscriptions)
      .where(eq(copySubscriptions.followerUserId, followerUserId))
      .orderBy(desc(copySubscriptions.createdAt));
  }

  async findActiveByFollower(followerUserId: string, tx?: DrizzleDB): Promise<CopySubscription[]> {
    const client = tx ?? this.db;
    return client
      .select()
      .from(copySubscriptions)
      .where(
        and(
          eq(copySubscriptions.followerUserId, followerUserId),
          eq(copySubscriptions.status, SubscriptionStatus.ACTIVE),
        ),
      );
  }

  async findActiveByMaster(masterId: string, tx?: DrizzleDB): Promise<CopySubscription[]> {
    const client = tx ?? this.db;
    return client
      .select()
      .from(copySubscriptions)
      .where(
        and(
          eq(copySubscriptions.masterId, masterId),
          eq(copySubscriptions.status, SubscriptionStatus.ACTIVE),
        ),
      )
      .orderBy(copySubscriptions.createdAt);
  }

  async reactivateSubscription(
    id: string,
    allocatedBalance: string,
    maxSlippagePercent: string,
    tx?: DrizzleDB,
  ): Promise<CopySubscription> {
    const client = tx ?? this.db;
    const [updated] = await client
      .update(copySubscriptions)
      .set({
        status: SubscriptionStatus.ACTIVE,
        allocatedBalance,
        maxSlippagePercent,
        updatedAt: new Date(),
      })
      .where(eq(copySubscriptions.id, id))
      .returning();

    return updated;
  }

  async updateStatus(
    id: string,
    status: SubscriptionStatus,
    tx?: DrizzleDB,
  ): Promise<CopySubscription> {
    const client = tx ?? this.db;
    const [updated] = await client
      .update(copySubscriptions)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(copySubscriptions.id, id))
      .returning();

    return updated;
  }

  /**
   * Calculates net completed position for a subscription on a given pair:
   * SubPos = SUM(Qty_BUY) - SUM(Qty_SELL)
   */
  async getSubscriptionPosition(
    subscriptionId: string,
    pair: string,
    tx?: DrizzleDB,
  ): Promise<{
    buyQty: string;
    sellQty: string;
  }> {
    const client = tx ?? this.db;
    const results = await client
      .select({
        side: copyOrdersHistory.masterSide,
        totalQty: sql<string>`coalesce(sum(cast(${copyOrdersHistory.replicatedQuantity} as numeric)), 0)::text`,
      })
      .from(copyOrdersHistory)
      .where(
        and(
          eq(copyOrdersHistory.subscriptionId, subscriptionId),
          eq(copyOrdersHistory.pair, pair),
          eq(copyOrdersHistory.status, 'COMPLETED'),
        ),
      )
      .groupBy(copyOrdersHistory.masterSide);

    let buyQty = '0';
    let sellQty = '0';
    for (const row of results) {
      if (row.side === 'BUY') {
        buyQty = row.totalQty;
      } else if (row.side === 'SELL') {
        sellQty = row.totalQty;
      }
    }

    return { buyQty, sellQty };
  }
}
