import { DbTestContext } from '../../../test/helpers';
import { CopySubscriptionsRepository } from '../src/database/copy-subscriptions.repository';
import * as schema from '../src/database/schema';

describe('CopySubscriptionsRepository (Integration)', () => {
  let context: DbTestContext<typeof schema>;
  let repository: CopySubscriptionsRepository;

  const testMasterUserId = '018f3a2b-1111-7000-8000-000000000001';
  const testFollowerUserId = '018f3a2b-2222-7000-8000-000000000002';
  let createdMasterId: string;

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

    repository = new CopySubscriptionsRepository(context.db);
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

    // Seed master trader
    const [master] = await context.db
      .insert(schema.masterTraders)
      .values({
        userId: testMasterUserId,
        displayName: 'Master Alice',
        minDeposit: '50.00000000',
        isActive: true,
      })
      .returning();
    createdMasterId = master.id;
  });

  it('should create and retrieve a copy subscription', async () => {
    const sub = await repository.create({
      followerUserId: testFollowerUserId,
      masterId: createdMasterId,
      allocatedBalance: '500.00000000',
      maxSlippagePercent: '1.00',
      status: 'ACTIVE',
    });

    expect(sub).toBeDefined();
    expect(sub.id).toBeDefined();
    expect(sub.allocatedBalance).toBe('500.00000000');

    const fetched = await repository.findById(sub.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.followerUserId).toBe(testFollowerUserId);
    expect(fetched?.masterId).toBe(createdMasterId);
  });

  it('should enforce unique index on (follower_user_id, master_id)', async () => {
    await repository.create({
      followerUserId: testFollowerUserId,
      masterId: createdMasterId,
      allocatedBalance: '500.00000000',
      status: 'ACTIVE',
    });

    // Attempting duplicate insert with same follower and master must fail with 23505
    await expect(
      repository.create({
        followerUserId: testFollowerUserId,
        masterId: createdMasterId,
        allocatedBalance: '300.00000000',
        status: 'ACTIVE',
      }),
    ).rejects.toThrow();
  });

  it('should find active subscriptions by follower and by master', async () => {
    await repository.create({
      followerUserId: testFollowerUserId,
      masterId: createdMasterId,
      allocatedBalance: '500.00000000',
      status: 'ACTIVE',
    });

    const activeByFollower = await repository.findActiveByFollower(testFollowerUserId);
    expect(activeByFollower).toHaveLength(1);

    const activeByMaster = await repository.findActiveByMaster(createdMasterId);
    expect(activeByMaster).toHaveLength(1);
    expect(activeByMaster[0].followerUserId).toBe(testFollowerUserId);
  });

  it('should reactivate a terminated subscription', async () => {
    const sub = await repository.create({
      followerUserId: testFollowerUserId,
      masterId: createdMasterId,
      allocatedBalance: '500.00000000',
      status: 'TERMINATED',
    });

    const reactivated = await repository.reactivateSubscription(sub.id, '750.00000000', '2.00');
    expect(reactivated.status).toBe('ACTIVE');
    expect(reactivated.allocatedBalance).toBe('750.00000000');
    expect(reactivated.maxSlippagePercent).toBe('2.00');
  });
});
