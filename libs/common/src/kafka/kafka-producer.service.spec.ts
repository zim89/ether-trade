import { ConfigService } from '@nestjs/config';
import { CONFIG_NAMESPACES } from '../constants';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaProducerRecord } from './kafka.types';

describe('KafkaProducerService (Unit)', () => {
  let service: KafkaProducerService;
  let connectMock: jest.Mock;
  let disconnectMock: jest.Mock;
  let sendMock: jest.Mock;
  let sendBatchMock: jest.Mock;
  let configGetMock: jest.Mock;

  beforeEach(() => {
    configGetMock = jest.fn().mockReturnValue({
      brokers: ['localhost:9094'],
      clientId: 'test-producer',
    });

    const configService = {
      get: configGetMock,
    } as unknown as ConfigService;

    service = new KafkaProducerService(configService);

    connectMock = jest.fn().mockResolvedValue(undefined);
    disconnectMock = jest.fn().mockResolvedValue(undefined);
    sendMock = jest.fn().mockResolvedValue([{ topicName: 'test.topic', partition: 0 }]);
    sendBatchMock = jest.fn().mockResolvedValue([{ topicName: 'test.topic', partition: 0 }]);

    const mockKafkaProducer = {
      connect: connectMock,
      disconnect: disconnectMock,
      send: sendMock,
      sendBatch: sendBatchMock,
    };

    (service as any).producer = mockKafkaProducer;
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
  });

  it('should initialize with configured brokers and client ID', () => {
    expect(configGetMock.mock.calls[0]).toEqual([CONFIG_NAMESPACES.kafka]);
  });

  it('should connect only once if already connected', async () => {
    await service.connect();
    await service.connect();

    expect(connectMock.mock.calls.length).toBe(1);
  });

  it('should send a single record and stringify json payload', async () => {
    const record: KafkaProducerRecord = {
      topic: 'dev.orders.order_placed',
      key: 'ETH_USDT',
      value: { orderId: '123', amount: '1.5' },
      headers: { 'x-correlation-id': 'corr-1' },
    };

    await service.send(record);

    expect(sendMock.mock.calls[0]).toEqual([
      {
        topic: 'dev.orders.order_placed',
        messages: [
          {
            key: 'ETH_USDT',
            value: JSON.stringify({ orderId: '123', amount: '1.5' }),
            headers: { 'x-correlation-id': 'corr-1' },
          },
        ],
      },
    ]);
  });

  it('should group batch records by topic and call producer.sendBatch', async () => {
    const records: KafkaProducerRecord[] = [
      {
        topic: 'dev.matching.trade_executed',
        key: 'ETH_USDT',
        value: { tradeId: 't-1' },
      },
      {
        topic: 'dev.orders.order_filled',
        key: 'ETH_USDT',
        value: { orderId: 'o-1' },
      },
      {
        topic: 'dev.matching.trade_executed',
        key: 'ETH_USDT',
        value: { tradeId: 't-2' },
      },
    ];

    await service.sendBatch(records);

    expect(sendBatchMock.mock.calls.length).toBe(1);
    const callArgs = sendBatchMock.mock.calls[0][0];

    expect(callArgs.topicMessages).toHaveLength(2);

    const matchingTopicGroup = callArgs.topicMessages.find(
      (tm: any) => tm.topic === 'dev.matching.trade_executed',
    );
    expect(matchingTopicGroup?.messages).toHaveLength(2);

    const ordersTopicGroup = callArgs.topicMessages.find(
      (tm: any) => tm.topic === 'dev.orders.order_filled',
    );
    expect(ordersTopicGroup?.messages).toHaveLength(1);
  });

  it('should return empty array when sending an empty batch without calling kafka', async () => {
    const result = await service.sendBatch([]);
    expect(result).toEqual([]);
    expect(sendBatchMock.mock.calls.length).toBe(0);
  });
});
