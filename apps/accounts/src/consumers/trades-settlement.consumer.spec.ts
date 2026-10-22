import { ConfigService } from '@nestjs/config';
import { Currency, TRADING_PAIRS } from '@app/common/constants';
import { KafkaProducerService } from '@app/common/kafka/kafka-producer.service';
import { getKafkaTopicName, KAFKA_DOMAINS } from '@app/common/kafka/kafka.constants';
import { KafkaBatchConsumerPayload } from '@app/common/kafka/kafka.types';
import { DomainEventEnvelope, DOMAIN_EVENT_TYPES, TradeExecutedEvent } from '@app/contracts';
import { BalancesRepository } from '../balances/balances.repository';
import type { DrizzleDB } from '../database/database.module';
import { ProcessedEventsRepository } from './processed-events.repository';
import { TradesSettlementConsumer } from './trades-settlement.consumer';

describe('TradesSettlementConsumer (Unit)', () => {
  let consumer: TradesSettlementConsumer;
  let findOrCreateMock: jest.Mock;
  let isProcessedMock: jest.Mock;
  let recordProcessedMock: jest.Mock;
  let transactionMock: jest.Mock;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('test'),
    } as unknown as ConfigService;

    const producerService = {
      send: jest.fn(),
      sendBatch: jest.fn(),
    } as unknown as KafkaProducerService;

    findOrCreateMock = jest.fn();

    const balancesRepository = {
      findOrCreate: findOrCreateMock,
    } as unknown as BalancesRepository;

    isProcessedMock = jest.fn();
    recordProcessedMock = jest.fn();
    const processedEventsRepository = {
      isEventProcessed: isProcessedMock,
      markEventProcessed: recordProcessedMock,
    } as unknown as ProcessedEventsRepository;

    transactionMock = jest.fn((callback: (tx: DrizzleDB) => Promise<unknown>) =>
      callback({} as unknown as DrizzleDB),
    );

    const mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      for: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      transaction: transactionMock,
    } as unknown as DrizzleDB;

    consumer = new TradesSettlementConsumer(
      configService,
      producerService,
      balancesRepository,
      processedEventsRepository,
      mockDb,
    );
  });

  it('should skip processing and log warning if self-trade detected', async () => {
    const tradeEvent: TradeExecutedEvent = {
      tradeId: 't-self-1',
      buyOrderId: 'b-1',
      sellOrderId: 's-1',
      buyerUserId: 'user-alice',
      sellerUserId: 'user-alice', // SAME USER
      symbol: TRADING_PAIRS.ETH_USDT,
      price: '3000.00000000',
      quantity: '1.00000000',
      buyerLimitPrice: '3000.00000000',
      buyerFee: '0',
      sellerFee: '0',
      sequenceId: 1,
      timestamp: Date.now(),
    };

    const envelope: DomainEventEnvelope<TradeExecutedEvent> = {
      eventId: 'evt-self-1',
      eventType: DOMAIN_EVENT_TYPES.tradeExecuted,
      aggregateId: 't-self-1',
      partitionKey: TRADING_PAIRS.ETH_USDT,
      timestamp: Date.now(),
      correlationId: 'corr-self',
      payload: tradeEvent,
    };

    const payload: KafkaBatchConsumerPayload = {
      topic: getKafkaTopicName('test', KAFKA_DOMAINS.matching),
      partition: 0,
      offset: '10',
      key: TRADING_PAIRS.ETH_USDT,
      value: envelope,
      headers: {},
      heartbeat: jest.fn(),
    };

    await consumer.handleMessage(payload);

    expect(findOrCreateMock.mock.calls.length).toBe(0);
    expect(transactionMock.mock.calls.length).toBe(0);
  });

  it('should throw Error if envelope schema is invalid or missing eventId', async () => {
    const payload: KafkaBatchConsumerPayload = {
      topic: getKafkaTopicName('test', KAFKA_DOMAINS.matching),
      partition: 0,
      offset: '11',
      key: TRADING_PAIRS.ETH_USDT,
      value: null,
      headers: {},
      heartbeat: jest.fn(),
    };

    await expect(consumer.handleMessage(payload)).rejects.toThrow('INVALID_EVENT_SCHEMA');
  });

  it('should skip settlement if event has already been processed (idempotency guard)', async () => {
    const tradeEvent: TradeExecutedEvent = {
      tradeId: 't-dup-1',
      buyOrderId: 'b-1',
      sellOrderId: 's-1',
      buyerUserId: 'user-buyer',
      sellerUserId: 'user-seller',
      symbol: TRADING_PAIRS.ETH_USDT,
      price: '3000.00000000',
      quantity: '1.00000000',
      buyerLimitPrice: '3000.00000000',
      buyerFee: '0',
      sellerFee: '0',
      sequenceId: 1,
      timestamp: Date.now(),
    };

    const envelope: DomainEventEnvelope<TradeExecutedEvent> = {
      eventId: 'evt-dup-1',
      eventType: DOMAIN_EVENT_TYPES.tradeExecuted,
      aggregateId: 't-dup-1',
      partitionKey: TRADING_PAIRS.ETH_USDT,
      timestamp: Date.now(),
      correlationId: 'corr-dup',
      payload: tradeEvent,
    };

    findOrCreateMock.mockResolvedValue({
      id: 'acc-1',
      userId: 'user-buyer',
      currency: Currency.USDT,
      availableBalance: '1000',
      lockedBalance: '1000',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    isProcessedMock.mockResolvedValue(true);

    const payload: KafkaBatchConsumerPayload = {
      topic: getKafkaTopicName('test', KAFKA_DOMAINS.matching),
      partition: 0,
      offset: '12',
      key: TRADING_PAIRS.ETH_USDT,
      value: envelope,
      headers: {},
      heartbeat: jest.fn(),
    };

    await consumer.handleMessage(payload);

    expect(isProcessedMock.mock.calls.length).toBe(1);
    expect(recordProcessedMock.mock.calls.length).toBe(0);
  });
});
