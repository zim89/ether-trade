import { DbTestContext } from '../../../test/helpers';
import { CopyOrdersHistoryRepository } from '../src/database/copy-orders-history.repository';
import * as schema from '../src/database/schema';

describe('CopyOrdersHistoryRepository (Integration)', () => {
  let context: DbTestContext<typeof schema>;
  let repository: CopyOrdersHistoryRepository;

  const testMasterUserId = '018f3a2b-1111-7000-8000-000000000001';
  const testFollowerUserId = '018f3a2b-2222-7000-8000-000000000002';
  let createdSubscriptionId: string;

  beforeAll(async () => {
    await DbTestContext.ensureDatabaseExists('copy_trading_test_db');
    context = new DbTestContext(
      {
        dbName: 'copy_trading_test_db',
        migrationsFolder: 'apps/copy-trading/src/database/migrations',
      },
      schema,
    );
    await context.runMigrations();

    repository = new CopyOrdersHistoryRepository(context.db);
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  beforeEach(async () => {
    await context.truncateTables([
      'copy_orders_history',
      'copy_subscriptions',
      'master_traders',
      'processed_events',
    ]);

    // Seed master and subscription
    const [master] = await context.db
      .insert(schema.masterTraders)
      .values({
        userId: testMasterUserId,
        displayName: 'Master Alice',
        minDeposit: '50.00000000',
        isActive: true,
      })
      .returning();

    const [sub] = await context.db
      .insert(schema.copySubscriptions)
      .values({
        followerUserId: testFollowerUserId,
        masterId: master.id,
        allocatedBalance: '500.00000000',
        status: 'ACTIVE',
      })
      .returning();

    createdSubscriptionId = sub.id;
  });

  it('should create and retrieve a copy order history record', async () => {
    const tradeId = '018f3a2b-3333-7000-8000-000000000003';
    const record = await repository.create({
      subscriptionId: createdSubscriptionId,
      masterTradeId: tradeId,
      followerOrderId: '018f3a2b-4444-7000-8000-000000000004',
      pair: 'ETH_USDT',
      masterSide: 'BUY',
      replicatedQuantity: '0.05000000',
      replicatedPrice: '2500.00000000',
      status: 'COMPLETED',
    });

    expect(record).not.toBeNull();
    expect(record?.subscriptionId).toBe(createdSubscriptionId);
    expect(record?.masterTradeId).toBe(tradeId);

    const fetched = await repository.findBySubscriptionAndTrade(createdSubscriptionId, tradeId);
    expect(fetched).not.toBeNull();
    expect(fetched?.status).toBe('COMPLETED');
    expect(fetched?.replicatedQuantity).toBe('0.05000000');
  });

  it('should support idempotent ON CONFLICT DO NOTHING for duplicate (subscription_id, master_trade_id)', async () => {
    const tradeId = '018f3a2b-5555-7000-8000-000000000005';
    const first = await repository.create({
      subscriptionId: createdSubscriptionId,
      masterTradeId: tradeId,
      pair: 'ETH_USDT',
      masterSide: 'BUY',
      replicatedQuantity: '0.05000000',
      replicatedPrice: '2500.00000000',
      status: 'COMPLETED',
    });
    expect(first).not.toBeNull();

    // Duplicate call must safely return null without throwing error
    const duplicate = await repository.create({
      subscriptionId: createdSubscriptionId,
      masterTradeId: tradeId,
      pair: 'ETH_USDT',
      masterSide: 'BUY',
      replicatedQuantity: '0.05000000',
      replicatedPrice: '2500.00000000',
      status: 'COMPLETED',
    });
    expect(duplicate).toBeNull();
  });

  it('should record FAILED and SKIPPED statuses with reasons', async () => {
    const skippedTradeId = '018f3a2b-6666-7000-8000-000000000006';
    const skippedRecord = await repository.create({
      subscriptionId: createdSubscriptionId,
      masterTradeId: skippedTradeId,
      pair: 'ETH_USDT',
      masterSide: 'BUY',
      replicatedQuantity: '0.00010000',
      replicatedPrice: '2500.00000000',
      status: 'SKIPPED',
      failureReason: 'BELOW_MIN_LOT',
    });

    expect(skippedRecord?.status).toBe('SKIPPED');
    expect(skippedRecord?.failureReason).toBe('BELOW_MIN_LOT');

    const history = await repository.findBySubscription(createdSubscriptionId);
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('SKIPPED');
  });
});
