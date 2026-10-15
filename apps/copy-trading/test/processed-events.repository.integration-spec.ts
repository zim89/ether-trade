import { DbTestContext } from '../../../test/helpers';
import { ProcessedEventsRepository } from '../src/database/processed-events.repository';
import * as schema from '../src/database/schema';

describe('ProcessedEventsRepository (Integration)', () => {
  let context: DbTestContext<typeof schema>;
  let repository: ProcessedEventsRepository;

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

    repository = new ProcessedEventsRepository(context.db);
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  beforeEach(async () => {
    await context.truncateTables(['processed_events']);
  });

  it('should detect unrecorded events as not processed and mark them as processed', async () => {
    const eventId = '018f3a2b-1111-7000-8000-000000000001';

    const initiallyProcessed = await repository.isProcessed(eventId);
    expect(initiallyProcessed).toBe(false);

    await repository.markProcessed({
      eventId,
      eventType: 'trade.executed',
      consumerGroup: 'copy-trading-replication-group',
    });

    const subsequentlyProcessed = await repository.isProcessed(eventId);
    expect(subsequentlyProcessed).toBe(true);
  });

  it('should safely handle duplicate event insertion via onConflictDoNothing', async () => {
    const eventId = '018f3a2b-2222-7000-8000-000000000002';

    const first = await repository.markProcessed({
      eventId,
      eventType: 'trade.executed',
      consumerGroup: 'copy-trading-replication-group',
    });
    expect(first).toBeDefined();

    const second = await repository.markProcessed({
      eventId,
      eventType: 'trade.executed',
      consumerGroup: 'copy-trading-replication-group',
    });
    expect(second).toBeUndefined();
  });
});
