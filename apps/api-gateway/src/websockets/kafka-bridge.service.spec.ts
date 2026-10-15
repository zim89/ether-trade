import { ConfigService } from '@nestjs/config';
import { KafkaProducerService } from '@app/common/kafka/kafka-producer.service';
import { KafkaBatchConsumerPayload } from '@app/common/kafka/kafka.types';
import {
  DepositConfirmedEvent,
  DomainEventType,
  OrderCancelledEvent,
  OrderFilledEvent,
  OrderPlacedEvent,
  OrderSide,
  OrderType,
  TradeExecutedEvent,
  WithdrawalCompletedEvent,
  WithdrawalFailedEvent,
} from '@app/contracts';
import { KafkaToWebSocketBridgeService } from './kafka-bridge.service';
import { ValkeyPubSubService } from './valkey-pubsub.service';

describe('KafkaToWebSocketBridgeService', () => {
  let service: KafkaToWebSocketBridgeService;
  let publishMock: jest.Mock;
  let valkeyPubSub: ValkeyPubSubService;
  let configService: ConfigService;
  let producerService: KafkaProducerService;

  beforeEach(() => {
    publishMock = jest.fn().mockResolvedValue(1);

    valkeyPubSub = {
      publish: publishMock,
    } as unknown as ValkeyPubSubService;

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'appEnv') return 'dev';
        return undefined;
      }),
    } as unknown as ConfigService;

    producerService = {} as unknown as KafkaProducerService;

    service = new KafkaToWebSocketBridgeService(configService, producerService, valkeyPubSub);
  });

  const createPayload = (
    eventType: DomainEventType,
    payload: unknown,
  ): KafkaBatchConsumerPayload => ({
    topic: 'dev.domain.event',
    partition: 0,
    offset: '1',
    key: 'test-key',
    value: {
      eventId: 'evt-1',
      eventType,
      aggregateId: 'agg-1',
      partitionKey: 'ETH_USDT',
      timestamp: 1600000000000,
      correlationId: 'corr-1',
      payload,
    },
    headers: {},
    heartbeat: jest.fn(),
  });

  it('should route trade.executed to trades:<symbol> and user:<userId>:orders', async () => {
    const tradeEvent: TradeExecutedEvent = {
      tradeId: 'tr-1',
      buyOrderId: 'bo-1',
      sellOrderId: 'so-1',
      buyerUserId: 'buyer-user',
      sellerUserId: 'seller-user',
      symbol: 'ETH_USDT',
      price: '3000.00000000',
      quantity: '1.50000000',
      buyerLimitPrice: '3000.00000000',
      buyerFee: '0',
      sellerFee: '0',
      sequenceId: 101,
      timestamp: 1600000000000,
    };

    await service.handleMessage(createPayload(DomainEventType.TRADE_EXECUTED, tradeEvent));

    expect(publishMock).toHaveBeenCalledTimes(3);

    // Public feed
    expect(publishMock).toHaveBeenCalledWith(
      'trades:ETH_USDT',
      expect.stringContaining('"channel":"trades:ETH_USDT"'),
    );

    // Private buyer feed
    expect(publishMock).toHaveBeenCalledWith(
      'user:buyer-user:orders',
      expect.stringContaining('"orderId":"bo-1"'),
    );

    // Private seller feed
    expect(publishMock).toHaveBeenCalledWith(
      'user:seller-user:orders',
      expect.stringContaining('"orderId":"so-1"'),
    );
  });

  it('should route order.placed to orderbook:<symbol> delta and user:<userId>:orders', async () => {
    const placedEvent: OrderPlacedEvent = {
      orderId: 'ord-100',
      userId: 'user-42',
      symbol: 'BTC_USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '60000.00000000',
      quantity: '0.50000000',
      levelTotalQuantity: '1.50000000',
      sequenceId: 42,
      timestamp: 1600000000000,
    };

    await service.handleMessage(createPayload(DomainEventType.ORDER_PLACED, placedEvent));

    expect(publishMock).toHaveBeenCalledTimes(2);

    expect(publishMock).toHaveBeenCalledWith(
      'orderbook:BTC_USDT',
      expect.stringContaining('"type":"delta"'),
    );

    expect(publishMock).toHaveBeenCalledWith(
      'user:user-42:orders',
      expect.stringContaining('"status":"OPEN"'),
    );
  });

  it('should route order.cancelled to orderbook:<symbol> and user:<userId>:orders', async () => {
    const cancelEvent: OrderCancelledEvent = {
      orderId: 'ord-100',
      userId: 'user-42',
      symbol: 'BTC_USDT',
      price: '60000.00000000',
      remainingQuantity: '0.50000000',
      levelTotalQuantity: '0',
      side: OrderSide.BUY,
      sequenceId: 43,
      reason: 'User cancelled',
      timestamp: 1600000000000,
    };

    await service.handleMessage(createPayload(DomainEventType.ORDER_CANCELLED, cancelEvent));

    expect(publishMock).toHaveBeenCalledTimes(2);

    expect(publishMock).toHaveBeenCalledWith(
      'orderbook:BTC_USDT',
      expect.stringContaining('"quantity":"0"'),
    );

    expect(publishMock).toHaveBeenCalledWith(
      'user:user-42:orders',
      expect.stringContaining('"status":"CANCELLED"'),
    );
  });

  it('should route order.filled to user:<userId>:orders', async () => {
    const filledEvent: OrderFilledEvent = {
      orderId: 'ord-100',
      userId: 'user-42',
      symbol: 'BTC_USDT',
      filledPrice: '60000.00000000',
      filledQuantity: '0.50000000',
      remainingQuantity: '0',
      fee: '0',
      timestamp: 1600000000000,
    };

    await service.handleMessage(createPayload(DomainEventType.ORDER_FILLED, filledEvent));

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith(
      'user:user-42:orders',
      expect.stringContaining('"status":"FILLED"'),
    );
  });

  it('should route deposit.confirmed to user:<userId>:transfers', async () => {
    const depositEvent: DepositConfirmedEvent = {
      depositId: 'dep-1',
      userId: 'user-42',
      currency: 'ETH',
      amount: '2.50000000',
      txHash: '0xabc',
      blockNumber: 12345,
      timestamp: 1600000000000,
    };

    await service.handleMessage(createPayload(DomainEventType.DEPOSIT_CONFIRMED, depositEvent));

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith(
      'user:user-42:transfers',
      expect.stringContaining('"status":"CREDITED"'),
    );
  });

  it('should route withdrawal.completed to user:<userId>:transfers', async () => {
    const withdrawEvent: WithdrawalCompletedEvent = {
      withdrawalId: 'wd-1',
      userId: 'user-42',
      currency: 'USDT',
      amount: '500.00000000',
      txHash: '0xdef',
      timestamp: 1600000000000,
    };

    await service.handleMessage(createPayload(DomainEventType.WITHDRAWAL_COMPLETED, withdrawEvent));

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith(
      'user:user-42:transfers',
      expect.stringContaining('"status":"COMPLETED"'),
    );
  });

  it('should route withdrawal.failed to user:<userId>:transfers', async () => {
    const failedEvent: WithdrawalFailedEvent = {
      withdrawalId: 'wd-2',
      userId: 'user-42',
      currency: 'USDT',
      amount: '500.00000000',
      txHash: '0xdef',
      reason: 'Insufficient balance',
      timestamp: 1600000000000,
    };

    await service.handleMessage(createPayload(DomainEventType.WITHDRAWAL_FAILED, failedEvent));

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith(
      'user:user-42:transfers',
      expect.stringContaining('"status":"FAILED"'),
    );
  });
});
