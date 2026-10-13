import { KAFKA_CONSUMER_GROUPS } from '@app/common/kafka/kafka.constants';
import { DomainEventType } from '@app/contracts';
import { DbTestContext } from '../../../test/helpers';
import { ProcessedEventsRepository } from '../src/consumers/processed-events.repository';
import * as schema from '../src/database/schema';

describe('ProcessedEventsRepository (Integration)', () => {
  let context: DbTestContext<typeof schema>;
  let repository: ProcessedEventsRepository;

  beforeAll(async () => {
    await DbTestContext.ensureDatabaseExists('accounts_test_db');
    context = new DbTestContext(
      {
        dbName: 'accounts_test_db',
        migrationsFolder: 'apps/accounts/src/database/migrations',
      },
      schema,
    );
    await context.runMigrations();

    repository = new ProcessedEventsRepository(context.db);
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  beforeEach(async () => {
    await context.truncateTables(['processed_events', 'ledger_transactions', 'accounts']);
  });

  it('should detect unrecorded events as not processed and mark them as processed', async () => {
    const eventId = '018f3a2b-1111-7000-8000-000000000001';

    const initiallyProcessed = await repository.isEventProcessed(eventId);
    expect(initiallyProcessed).toBe(false);

    await repository.markEventProcessed({
      eventId,
      eventType: DomainEventType.TRADE_EXECUTED,
      consumerGroup: KAFKA_CONSUMER_GROUPS.accountsSettlement,
    });

    const subsequentlyProcessed = await repository.isEventProcessed(eventId);
    expect(subsequentlyProcessed).toBe(true);
  });

  it('should support checking and recording inside an active database transaction', async () => {
    const eventId = '018f3a2b-1111-7000-8000-000000000002';

    await context.db.transaction(async (tx) => {
      const beforeInTx = await repository.isEventProcessed(eventId, tx);
      expect(beforeInTx).toBe(false);

      await repository.markEventProcessed(
        {
          eventId,
          eventType: DomainEventType.TRADE_EXECUTED,
          consumerGroup: KAFKA_CONSUMER_GROUPS.accountsSettlement,
        },
        tx,
      );

      const afterInTx = await repository.isEventProcessed(eventId, tx);
      expect(afterInTx).toBe(true);
    });

    const finalizedCheck = await repository.isEventProcessed(eventId);
    expect(finalizedCheck).toBe(true);
  });

  it('should delete processed events older than retention cutoff date', async () => {
    await repository.markEventProcessed({
      eventId: '018f3a2b-1111-7000-8000-000000000003',
      eventType: DomainEventType.TRADE_EXECUTED,
      consumerGroup: KAFKA_CONSUMER_GROUPS.accountsSettlement,
    });

    const futureCutoff = new Date(Date.now() + 60_000);
    const deletedCount = await repository.deleteOlderThan(futureCutoff, 100);
    expect(deletedCount).toBe(1);

    const checkAfterDelete = await repository.isEventProcessed(
      '018f3a2b-1111-7000-8000-000000000003',
    );
    expect(checkAfterDelete).toBe(false);
  });
});
