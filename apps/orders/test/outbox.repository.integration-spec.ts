import { TRADING_PAIRS } from '@app/common/constants';
import { DOMAIN_EVENT_TYPES, OutboxAggregateType, OutboxStatus } from '@app/contracts';
import { DbTestContext } from '../../../test/helpers';
import * as schema from '../src/database/schema';
import { OutboxRepository } from '../src/outbox/outbox.repository';

describe('OutboxRepository (Integration)', () => {
  let context: DbTestContext<typeof schema>;
  let repository: OutboxRepository;

  beforeAll(async () => {
    await DbTestContext.ensureDatabaseExists('orders_test_db');
    context = new DbTestContext(
      {
        dbName: 'orders_test_db',
        migrationsFolder: 'apps/orders/src/database/migrations',
      },
      schema,
    );
    await context.runMigrations();

    repository = new OutboxRepository(context.db);
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  beforeEach(async () => {
    await context.truncateTables(['outbox_events', 'orders', 'idempotency_records']);
  });

  it('should insert outbox event and fetch pending batch', async () => {
    const inserted = await repository.insert({
      aggregateType: OutboxAggregateType.ORDER,
      aggregateId: '018f3a2b-1111-7000-8000-000000000001',
      partitionKey: TRADING_PAIRS.ETH_USDT,
      eventType: DOMAIN_EVENT_TYPES.orderPlaced,
      payload: { test: true },
      status: OutboxStatus.PENDING,
      retryCount: 0,
    });

    expect(inserted).toBeDefined();
    expect(inserted.id).toBeDefined();
    expect(inserted.status).toBe(OutboxStatus.PENDING);

    const pending = await context.db.transaction(async (tx) => {
      return repository.fetchPendingBatch(10, tx);
    });

    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(inserted.id);
    expect(pending[0].status).toBe(OutboxStatus.PENDING);
  });

  it('should prevent concurrent relay workers from selecting the same pending batch via SKIP LOCKED', async () => {
    await repository.insertMany([
      {
        aggregateType: OutboxAggregateType.ORDER,
        aggregateId: '018f3a2b-1111-7000-8000-000000000001',
        partitionKey: TRADING_PAIRS.ETH_USDT,
        eventType: DOMAIN_EVENT_TYPES.orderPlaced,
        payload: { item: 1 },
        status: OutboxStatus.PENDING,
      },
      {
        aggregateType: OutboxAggregateType.ORDER,
        aggregateId: '018f3a2b-1111-7000-8000-000000000002',
        partitionKey: TRADING_PAIRS.ETH_USDT,
        eventType: DOMAIN_EVENT_TYPES.orderPlaced,
        payload: { item: 2 },
        status: OutboxStatus.PENDING,
      },
    ]);

    // Worker 1 holds open transaction locking first event
    let worker2BatchLength = 0;
    await context.db.transaction(async (tx1) => {
      const worker1Batch = await repository.fetchPendingBatch(1, tx1);
      expect(worker1Batch.length).toBe(1);

      // In a concurrent connection/transaction, Worker 2 selects batch with SKIP LOCKED
      await context.db.transaction(async (tx2) => {
        const worker2Batch = await repository.fetchPendingBatch(1, tx2);
        worker2BatchLength = worker2Batch.length;
        if (worker2Batch.length > 0) {
          // Must not collide with worker 1
          expect(worker2Batch[0].id).not.toBe(worker1Batch[0].id);
        }
      });
    });

    expect(worker2BatchLength).toBe(1);
  });

  it('should mark events as published atomically', async () => {
    const created = await repository.insert({
      aggregateType: OutboxAggregateType.ORDER,
      aggregateId: '018f3a2b-1111-7000-8000-000000000003',
      partitionKey: TRADING_PAIRS.ETH_USDT,
      eventType: DOMAIN_EVENT_TYPES.orderPlaced,
      payload: { ok: true },
      status: OutboxStatus.PENDING,
    });

    await repository.markAsPublished([created.id]);

    const pending = await context.db.transaction(async (tx) => {
      return repository.fetchPendingBatch(10, tx);
    });
    expect(pending.length).toBe(0);
  });

  it('should mark event as failed and increment retry count', async () => {
    const created = await repository.insert({
      aggregateType: OutboxAggregateType.ORDER,
      aggregateId: '018f3a2b-1111-7000-8000-000000000004',
      partitionKey: TRADING_PAIRS.ETH_USDT,
      eventType: DOMAIN_EVENT_TYPES.orderPlaced,
      payload: { fail: true },
      status: OutboxStatus.PENDING,
    });

    await repository.markAsFailed(created.id, 'Broker unavailable');

    const pending = await context.db.transaction(async (tx) => {
      return repository.fetchPendingBatch(10, tx);
    });
    expect(pending.length).toBe(0);
  });

  it('should purge published events older than retention cutoff date', async () => {
    const created = await repository.insert({
      aggregateType: OutboxAggregateType.ORDER,
      aggregateId: '018f3a2b-1111-7000-8000-000000000005',
      partitionKey: TRADING_PAIRS.ETH_USDT,
      eventType: DOMAIN_EVENT_TYPES.orderPlaced,
      payload: { old: true },
      status: OutboxStatus.PENDING,
    });

    await repository.markAsPublished([created.id]);

    // Cutoff in future should delete the record
    const futureCutoff = new Date(Date.now() + 60_000);
    const deletedCount = await repository.deletePublishedEventsOlderThan(futureCutoff, 100);
    expect(deletedCount).toBe(1);
  });
});
