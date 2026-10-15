import { ConfigService } from '@nestjs/config';
import { Currency, TRADING_PAIRS } from '@app/common/constants';
import { KafkaProducerService } from '@app/common/kafka/kafka-producer.service';
import {
  getKafkaTopicName,
  KAFKA_DOMAINS,
  KAFKA_TOPIC_EVENTS,
} from '@app/common/kafka/kafka.constants';
import { KafkaBatchConsumerPayload } from '@app/common/kafka/kafka.types';
import { DomainEventEnvelope, DomainEventType, TradeExecutedEvent } from '@app/contracts';
import { DbTestContext } from '../../../test/helpers';
import { BalancesRepository } from '../src/balances/balances.repository';
import { ProcessedEventsRepository } from '../src/consumers/processed-events.repository';
import { TradesSettlementConsumer } from '../src/consumers/trades-settlement.consumer';
import * as schema from '../src/database/schema';

describe('TradesSettlement (Integration)', () => {
  let context: DbTestContext<typeof schema>;
  let balancesRepository: BalancesRepository;
  let processedEventsRepository: ProcessedEventsRepository;
  let consumer: TradesSettlementConsumer;

  const buyerUserId = '018f3a2b-1111-7000-8000-000000000001';
  const sellerUserId = '018f3a2b-2222-7000-8000-000000000002';

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

    balancesRepository = new BalancesRepository(context.db);
    processedEventsRepository = new ProcessedEventsRepository(context.db);

    const configService = {
      get: jest.fn().mockReturnValue('test'),
    } as unknown as ConfigService;

    const producerService = {
      send: jest.fn(),
      sendBatch: jest.fn(),
    } as unknown as KafkaProducerService;

    consumer = new TradesSettlementConsumer(
      configService,
      producerService,
      balancesRepository,
      processedEventsRepository,
      context.db,
    );
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  beforeEach(async () => {
    await context.truncateTables(['processed_events', 'ledger_transactions', 'accounts']);
  });

  it('should settle trade and update balances with Price Improvement surplus return', async () => {
    // 1. Setup pre-conditions:
    // Buyer locked 3050 USDT (buyerLimitPrice was 3050)
    await balancesRepository.deposit({
      userId: buyerUserId,
      currency: Currency.USDT,
      amount: '3050.00000000',
      idempotencyKey: 'dep-buyer-1',
    });
    await balancesRepository.lock({
      userId: buyerUserId,
      currency: Currency.USDT,
      amount: '3050.00000000',
      idempotencyKey: 'lock-buyer-1',
    });

    // Seller locked 1 ETH
    await balancesRepository.deposit({
      userId: sellerUserId,
      currency: Currency.ETH,
      amount: '1.00000000',
      idempotencyKey: 'dep-seller-1',
    });
    await balancesRepository.lock({
      userId: sellerUserId,
      currency: Currency.ETH,
      amount: '1.00000000',
      idempotencyKey: 'lock-seller-1',
    });

    // 2. Trade executed at matched price 3000 (buyer gets 50 USDT surplus back)
    const tradeEvent: TradeExecutedEvent = {
      tradeId: '018f3a2b-9999-7000-8000-000000000001',
      buyOrderId: 'b-ord-1',
      sellOrderId: 's-ord-1',
      buyerUserId,
      sellerUserId,
      symbol: TRADING_PAIRS.ETH_USDT,
      price: '3000.00000000',
      quantity: '1.00000000',
      buyerLimitPrice: '3050.00000000',
      buyerFee: '0.00000000',
      sellerFee: '0.00000000',
      sequenceId: 1,
      timestamp: Date.now(),
    };

    const envelope: DomainEventEnvelope<TradeExecutedEvent> = {
      eventId: '018f3a2b-8888-7000-8000-000000000001',
      eventType: DomainEventType.TRADE_EXECUTED,
      aggregateId: tradeEvent.tradeId,
      partitionKey: tradeEvent.symbol,
      timestamp: Date.now(),
      correlationId: 'corr-trade-1',
      payload: tradeEvent,
    };

    const payload: KafkaBatchConsumerPayload = {
      topic: getKafkaTopicName('test', KAFKA_DOMAINS.matching, KAFKA_TOPIC_EVENTS.tradeExecuted),
      partition: 0,
      offset: '100',
      key: tradeEvent.symbol,
      value: envelope,
      headers: {},
      heartbeat: jest.fn(),
    };

    // 3. Process message
    await consumer.handleMessage(payload);

    // 4. Verify account balances after clearing:
    // Buyer:
    // - USDT locked: 0, USDT available: 50 (surplus returned)
    // - ETH available: 1 (received from seller)
    const buyerUsdt = await balancesRepository.findOrCreate(buyerUserId, Currency.USDT);
    expect(Number(buyerUsdt.lockedBalance)).toBe(0);
    expect(Number(buyerUsdt.availableBalance)).toBe(50);

    const buyerEth = await balancesRepository.findOrCreate(buyerUserId, Currency.ETH);
    expect(Number(buyerEth.availableBalance)).toBe(1);

    // Seller:
    // - ETH locked: 0
    // - USDT available: 3000 (received from buyer)
    const sellerEth = await balancesRepository.findOrCreate(sellerUserId, Currency.ETH);
    expect(Number(sellerEth.lockedBalance)).toBe(0);

    const sellerUsdt = await balancesRepository.findOrCreate(sellerUserId, Currency.USDT);
    expect(Number(sellerUsdt.availableBalance)).toBe(3000);

    // 5. Verify processed event recorded for deduplication
    const isRecorded = await processedEventsRepository.isEventProcessed(envelope.eventId);
    expect(isRecorded).toBe(true);

    // 6. Verify duplicate delivery does not mutate state again (Idempotency)
    await consumer.handleMessage(payload);

    const buyerUsdtAfterDup = await balancesRepository.findOrCreate(buyerUserId, Currency.USDT);
    expect(Number(buyerUsdtAfterDup.availableBalance)).toBe(50);
  });
});
