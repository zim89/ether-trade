import { ConfigService } from '@nestjs/config';
import { SHARED_ENV_KEYS } from '@app/common/constants';
import { KafkaProducerService } from '@app/common/kafka/kafka-producer.service';
import {
  getKafkaTopicName,
  KAFKA_CLIENT_IDS,
  KAFKA_DOMAINS,
  KAFKA_HEADERS,
} from '@app/common/kafka/kafka.constants';
import { TelemetryMetricsService } from '@app/common/telemetry';
import { OutboxAggregateType, OutboxStatus } from '@app/contracts';
import type { DrizzleDB } from '../database/database.module';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxRepository } from './outbox.repository';

describe('OutboxRelayService (Unit)', () => {
  let service: OutboxRelayService;
  let fetchPendingBatchMock: jest.Mock;
  let markAsPublishedMock: jest.Mock;
  let recordRetryAttemptMock: jest.Mock;
  let markAsFailedMock: jest.Mock;
  let sendBatchMock: jest.Mock;
  let configServiceGetMock: jest.Mock;
  let mockDb: DrizzleDB;

  beforeEach(() => {
    fetchPendingBatchMock = jest.fn();
    markAsPublishedMock = jest.fn();
    recordRetryAttemptMock = jest.fn();
    markAsFailedMock = jest.fn();
    sendBatchMock = jest.fn();

    const outboxRepository = {
      fetchPendingBatch: fetchPendingBatchMock,
      markAsPublished: markAsPublishedMock,
      recordRetryAttempt: recordRetryAttemptMock,
      markAsFailed: markAsFailedMock,
    } as unknown as OutboxRepository;

    const kafkaProducer = {
      sendBatch: sendBatchMock,
    } as unknown as KafkaProducerService;

    configServiceGetMock = jest.fn((key: string) => {
      if (key === SHARED_ENV_KEYS.appEnv) return 'test';
      return undefined;
    });

    const configService = {
      get: configServiceGetMock,
    } as unknown as ConfigService;

    mockDb = {
      transaction: jest.fn((callback: (tx: DrizzleDB) => Promise<unknown>) => callback(mockDb)),
    } as unknown as DrizzleDB;

    const mockTelemetryMetrics = {
      outboxUnprocessedRecordsCount: { add: jest.fn() },
    } as unknown as TelemetryMetricsService;

    service = new OutboxRelayService(
      outboxRepository,
      kafkaProducer,
      configService,
      mockDb,
      mockTelemetryMetrics,
    );
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
  });

  it('should return 0 if no pending events in batch', async () => {
    fetchPendingBatchMock.mockResolvedValue([]);

    const count = await service.processBatch();

    expect(count).toBe(0);
    expect(sendBatchMock.mock.calls.length).toBe(0);
    expect(markAsPublishedMock.mock.calls.length).toBe(0);
  });

  it('should transform events and publish batch to Kafka', async () => {
    const mockEvents = [
      {
        id: 'outbox-1',
        aggregateType: OutboxAggregateType.ORDER,
        aggregateId: 'order-123',
        partitionKey: 'ETH_USDT',
        eventType: 'order_placed',
        payload: { eventId: 'event-1' },
        status: OutboxStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
        lastError: null,
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        tracestate: null,
      },
      {
        id: 'outbox-2',
        aggregateType: OutboxAggregateType.TRADE,
        aggregateId: 'trade-456',
        partitionKey: 'ETH_USDT',
        eventType: 'trade_executed',
        payload: { eventId: 'event-2' },
        status: OutboxStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
        lastError: null,
        traceparent: null,
        tracestate: null,
      },
    ];

    fetchPendingBatchMock.mockResolvedValue(mockEvents);
    sendBatchMock.mockResolvedValue([]);
    markAsPublishedMock.mockResolvedValue(undefined);

    const count = await service.processBatch();

    expect(count).toBe(2);
    expect(sendBatchMock.mock.calls.length).toBe(1);

    const expectedOrderTopic = getKafkaTopicName('test', KAFKA_DOMAINS.orders);
    const expectedMatchingTopic = getKafkaTopicName('test', KAFKA_DOMAINS.matching);

    const sentRecords = sendBatchMock.mock.calls[0][0];
    expect(sentRecords).toHaveLength(2);

    expect(sentRecords[0]).toEqual({
      topic: expectedOrderTopic,
      key: 'ETH_USDT',
      value: { eventId: 'event-1' },
      headers: {
        [KAFKA_HEADERS.originService]: KAFKA_CLIENT_IDS.orders,
        [KAFKA_HEADERS.eventId]: 'outbox-1',
        [KAFKA_HEADERS.aggregateId]: 'order-123',
        [KAFKA_HEADERS.action]: 'ORDER_PLACED',
        [KAFKA_HEADERS.traceparent]: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
    });

    expect(sentRecords[1]).toEqual({
      topic: expectedMatchingTopic,
      key: 'ETH_USDT',
      value: { eventId: 'event-2' },
      headers: {
        [KAFKA_HEADERS.originService]: KAFKA_CLIENT_IDS.orders,
        [KAFKA_HEADERS.eventId]: 'outbox-2',
        [KAFKA_HEADERS.aggregateId]: 'trade-456',
        [KAFKA_HEADERS.action]: 'TRADE_EXECUTED',
      },
    });

    expect(markAsPublishedMock.mock.calls[0]).toEqual([['outbox-1', 'outbox-2'], mockDb]);
  });

  it('should record retry attempt on each event when Kafka publish fails', async () => {
    const mockEvents = [
      {
        id: 'outbox-1',
        aggregateType: OutboxAggregateType.ORDER,
        aggregateId: 'order-123',
        partitionKey: 'ETH_USDT',
        eventType: 'order_placed',
        payload: { eventId: 'event-1' },
        status: OutboxStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
        lastError: null,
      },
    ];

    fetchPendingBatchMock.mockResolvedValue(mockEvents);
    const publishError = new Error('Kafka broker connection lost');
    sendBatchMock.mockRejectedValue(publishError);

    await expect(service.processBatch()).rejects.toThrow('Kafka broker connection lost');

    expect(recordRetryAttemptMock.mock.calls[0]).toEqual([
      'outbox-1',
      'Kafka broker connection lost',
      mockDb,
    ]);
    expect(markAsPublishedMock.mock.calls.length).toBe(0);
  });
});
