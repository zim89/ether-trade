import { Injectable, Inject } from '@nestjs/common';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE_CLIENT } from './database.constants';
import type { DrizzleDB } from './database.module';
import { masterTraders, MasterTrader, NewMasterTrader } from './schema/master-traders.schema';

export interface FindMastersFilter {
  isActiveOnly?: boolean;
  limit?: number;
  offset?: number;
}

@Injectable()
export class MasterTradersRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  async create(newMaster: NewMasterTrader, tx?: DrizzleDB): Promise<MasterTrader> {
    const client = tx ?? this.db;
    const [created] = await client.insert(masterTraders).values(newMaster).returning();
    return created;
  }

  async findById(masterId: string, tx?: DrizzleDB): Promise<MasterTrader | null> {
    const client = tx ?? this.db;
    const [result] = await client
      .select()
      .from(masterTraders)
      .where(eq(masterTraders.id, masterId))
      .limit(1);

    return result ?? null;
  }

  async findByUserId(userId: string, tx?: DrizzleDB): Promise<MasterTrader | null> {
    const client = tx ?? this.db;
    const [result] = await client
      .select()
      .from(masterTraders)
      .where(eq(masterTraders.userId, userId))
      .limit(1);

    return result ?? null;
  }

  async findMany(
    filter: FindMastersFilter = {},
  ): Promise<{ items: MasterTrader[]; total: number }> {
    const conditions: (SQL | undefined)[] = [];
    if (filter.isActiveOnly) {
      conditions.push(eq(masterTraders.isActive, true));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(masterTraders)
      .where(whereClause);

    const total = countResult?.count ?? 0;

    let query = this.db
      .select()
      .from(masterTraders)
      .where(whereClause)
      .orderBy(desc(masterTraders.totalCopiers), desc(masterTraders.createdAt));

    if (filter.limit !== undefined) {
      query = query.limit(filter.limit) as typeof query;
    }
    if (filter.offset !== undefined) {
      query = query.offset(filter.offset) as typeof query;
    }

    const items = await query;
    return { items, total };
  }

  async findAllActive(): Promise<MasterTrader[]> {
    return this.db.select().from(masterTraders).where(eq(masterTraders.isActive, true));
  }

  async incrementCopiers(masterId: string, delta: number, tx?: DrizzleDB): Promise<void> {
    const client = tx ?? this.db;
    await client
      .update(masterTraders)
      .set({
        totalCopiers: sql`GREATEST(0, ${masterTraders.totalCopiers} + ${delta})`,
        updatedAt: new Date(),
      })
      .where(eq(masterTraders.id, masterId));
  }
}
