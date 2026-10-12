import { Injectable, Inject } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { OrderStatus } from '@app/contracts';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import { orders, Order, NewOrder } from '../database/schema/orders.schema';

export interface FindOrdersFilter {
  userId: string;
  pair?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class OrdersRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Inserts a new order into the database.
   */
  async create(newOrder: NewOrder): Promise<Order> {
    const [created] = await this.db.insert(orders).values(newOrder).returning();
    return created;
  }

  /**
   * Finds an order by its ID.
   */
  async findById(orderId: string): Promise<Order | null> {
    const [result] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

    return result ?? null;
  }

  /**
   * Finds an order by its ID and user ID.
   */
  async findByIdAndUserId(orderId: string, userId: string): Promise<Order | null> {
    const [result] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1);

    return result ?? null;
  }

  /**
   * Lists orders for a given user with optional pair, status filter and pagination.
   */
  async findMany(filter: FindOrdersFilter): Promise<{ items: Order[]; total: number }> {
    const conditions = [eq(orders.userId, filter.userId)];

    if (filter.pair) {
      conditions.push(eq(orders.pair, filter.pair));
    }
    if (filter.status) {
      conditions.push(eq(orders.status, filter.status));
    }

    const whereClause = and(...conditions);
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(whereClause);

    const items = await this.db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items,
      total: countResult?.count ?? 0,
    };
  }

  /**
   * Retrieves active orders (OPEN or PARTIALLY_FILLED) for cold-start orderbook rehydration.
   */
  async findActiveOrdersByPair(pair?: string): Promise<Order[]> {
    const activeStatuses = [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED];
    const conditions = [inArray(orders.status, activeStatuses)];

    if (pair) {
      conditions.push(eq(orders.pair, pair));
    }

    return this.db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(orders.createdAt);
  }

  /**
   * Updates order execution amounts and status.
   */
  async updateExecution(
    orderId: string,
    params: {
      filledAmount: string;
      remainingAmount: string;
      status: string;
    },
    tx?: DrizzleDB,
  ): Promise<Order | null> {
    const dbClient = tx ?? this.db;
    const [updated] = await dbClient
      .update(orders)
      .set({
        filledAmount: params.filledAmount,
        remainingAmount: params.remainingAmount,
        status: params.status,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    return updated ?? null;
  }

  /**
   * Cancels an open or partially filled order.
   */
  async cancel(orderId: string, userId: string): Promise<Order | null> {
    const cancellableStatuses = [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED];

    const [updated] = await this.db
      .update(orders)
      .set({
        status: OrderStatus.CANCELLED,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.userId, userId),
          inArray(orders.status, cancellableStatuses),
        ),
      )
      .returning();

    return updated ?? null;
  }
}
