import { TelemetryMetricsService } from '@app/common/telemetry';
import { OrderSide, OrderStatus, OrderType } from '@app/contracts';
import type { Order } from '../database/schema/orders.schema';
import { MatchingEngineService } from './matching-engine.service';
import { OrderbookService } from './orderbook.service';
import { OrdersRepository } from './orders.repository';
import { OrderbookEntry } from './orders.types';

describe('MatchingEngineService', () => {
  let service: MatchingEngineService;
  let findByIdMock: jest.Mock<Promise<Order | null>, [string]>;
  let updateExecutionMock: jest.Mock<Promise<Order | null>, [string, Partial<Order>]>;
  let getBestOpposingOrdersMock: jest.Mock<Promise<OrderbookEntry[]>, [string, OrderSide, number?]>;
  let removeOrderMock: jest.Mock<Promise<void>, [string, string, OrderSide]>;
  let updateRemainingAmountMock: jest.Mock<Promise<void>, [string, string]>;
  let addOrderMock: jest.Mock<Promise<void>, [OrderbookEntry]>;

  beforeEach(() => {
    findByIdMock = jest.fn();
    updateExecutionMock = jest.fn((id: string, updates: Partial<Order>): Promise<Order | null> =>
      Promise.resolve({
        id,
        userId: 'mock-user',
        pair: 'ETH_USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        price: '3000.00000000',
        amount: '1.00000000',
        filledAmount: '0.00000000',
        remainingAmount: '1.00000000',
        status: OrderStatus.OPEN,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...updates,
      } as Order),
    );

    getBestOpposingOrdersMock = jest.fn();
    removeOrderMock = jest.fn().mockResolvedValue(undefined);
    updateRemainingAmountMock = jest.fn().mockResolvedValue(undefined);
    addOrderMock = jest.fn().mockResolvedValue(undefined);

    const mockOrdersRepo = {
      findById: findByIdMock,
      updateExecution: updateExecutionMock,
    } as unknown as OrdersRepository;

    const mockOrderbookService = {
      getBestOpposingOrders: getBestOpposingOrdersMock,
      removeOrder: removeOrderMock,
      updateRemainingAmount: updateRemainingAmountMock,
      addOrder: addOrderMock,
    } as unknown as OrderbookService;

    const mockTelemetryMetrics = {
      matchingEngineDurationMs: { record: jest.fn() },
    } as unknown as TelemetryMetricsService;

    service = new MatchingEngineService(mockOrdersRepo, mockOrderbookService, mockTelemetryMetrics);
  });

  it('should fully match taker order when opposing maker order has equal amount and crossing price', async () => {
    const takerOrder: Order = {
      id: 'taker-buy-1',
      userId: 'user-taker',
      pair: 'ETH_USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '3000.00000000',
      amount: '1.00000000',
      filledAmount: '0.00000000',
      remainingAmount: '1.00000000',
      status: OrderStatus.OPEN,
      idempotencyKey: 'idemp-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const makerAsk: OrderbookEntry = {
      orderId: 'maker-sell-1',
      userId: 'user-maker',
      pair: 'ETH_USDT',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      price: '2990.00000000',
      amount: '1.00000000',
      remainingAmount: '1.00000000',
      createdAt: 1700000000,
    };

    getBestOpposingOrdersMock.mockResolvedValue([makerAsk]);
    findByIdMock.mockResolvedValue({
      id: 'maker-sell-1',
      filledAmount: '0.00000000',
    } as Order);

    const result = await service.match(takerOrder);

    expect(result.trades.length).toBe(1);
    expect(result.trades[0]).toMatchObject({
      makerOrderId: 'maker-sell-1',
      takerOrderId: 'taker-buy-1',
      price: '2990.00000000',
      quantity: '1.00000000',
      symbol: 'ETH_USDT',
      buyerUserId: 'user-taker',
      sellerUserId: 'user-maker',
      buyerLimitPrice: '3000.00000000',
      buyerFee: '0',
      sellerFee: '0',
    });

    expect(removeOrderMock).toHaveBeenCalledWith('maker-sell-1', 'ETH_USDT', OrderSide.SELL);

    expect(result.takerOrder.status).toBe(OrderStatus.FILLED);
    expect(result.takerOrder.remainingAmount).toBe('0.00000000');
    expect(result.takerOrder.filledAmount).toBe('1.00000000');
    expect(addOrderMock).not.toHaveBeenCalled();
  });

  it('should partially match taker order and place rest in orderbook when maker has less volume', async () => {
    const takerOrder: Order = {
      id: 'taker-buy-2',
      userId: 'user-taker',
      pair: 'ETH_USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '3000.00000000',
      amount: '3.00000000',
      filledAmount: '0.00000000',
      remainingAmount: '3.00000000',
      status: OrderStatus.OPEN,
      idempotencyKey: 'idemp-2',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const makerAsk: OrderbookEntry = {
      orderId: 'maker-sell-2',
      userId: 'user-maker',
      pair: 'ETH_USDT',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      price: '3000.00000000',
      amount: '1.00000000',
      remainingAmount: '1.00000000',
      createdAt: 1700000000,
    };

    getBestOpposingOrdersMock.mockResolvedValue([makerAsk]);
    findByIdMock.mockResolvedValue({
      id: 'maker-sell-2',
      filledAmount: '0.00000000',
    } as Order);

    const result = await service.match(takerOrder);

    expect(result.trades.length).toBe(1);
    expect(result.trades[0].quantity).toBe('1.00000000');

    expect(result.takerOrder.status).toBe(OrderStatus.PARTIALLY_FILLED);
    expect(result.takerOrder.filledAmount).toBe('1.00000000');
    expect(result.takerOrder.remainingAmount).toBe('2.00000000');

    expect(addOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'taker-buy-2',
        remainingAmount: '2.00000000',
      }),
    );
  });

  it('should partially fill maker order and update remaining in orderbook when taker has less volume', async () => {
    const takerOrder: Order = {
      id: 'taker-sell-3',
      userId: 'user-taker',
      pair: 'ETH_USDT',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      price: '2900.00000000',
      amount: '0.50000000',
      filledAmount: '0.00000000',
      remainingAmount: '0.50000000',
      status: OrderStatus.OPEN,
      idempotencyKey: 'idemp-3',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const makerBid: OrderbookEntry = {
      orderId: 'maker-buy-3',
      userId: 'user-maker',
      pair: 'ETH_USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '2950.00000000',
      amount: '2.00000000',
      remainingAmount: '2.00000000',
      createdAt: 1700000000,
    };

    getBestOpposingOrdersMock.mockResolvedValue([makerBid]);
    findByIdMock.mockResolvedValue({
      id: 'maker-buy-3',
      filledAmount: '0.00000000',
    } as Order);

    const result = await service.match(takerOrder);

    expect(result.trades.length).toBe(1);
    expect(result.trades[0].quantity).toBe('0.50000000');

    expect(updateRemainingAmountMock).toHaveBeenCalledWith('maker-buy-3', '1.50000000');
    expect(removeOrderMock).not.toHaveBeenCalled();

    expect(result.takerOrder.status).toBe(OrderStatus.FILLED);
    expect(result.takerOrder.remainingAmount).toBe('0.00000000');
  });

  it('should skip maker order and not match when Self-Trade Prevention (STP) triggers (same userId)', async () => {
    const takerOrder: Order = {
      id: 'taker-buy-stp',
      userId: 'same-user',
      pair: 'ETH_USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '3000.00000000',
      amount: '1.00000000',
      filledAmount: '0.00000000',
      remainingAmount: '1.00000000',
      status: OrderStatus.OPEN,
      idempotencyKey: 'idemp-stp',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const makerAskSameUser: OrderbookEntry = {
      orderId: 'maker-sell-stp',
      userId: 'same-user', // Same user!
      pair: 'ETH_USDT',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      price: '2990.00000000',
      amount: '1.00000000',
      remainingAmount: '1.00000000',
      createdAt: 1700000000,
    };

    getBestOpposingOrdersMock.mockResolvedValue([makerAskSameUser]);

    const result = await service.match(takerOrder);

    expect(result.trades.length).toBe(0);
    expect(result.takerOrder.status).toBe(OrderStatus.OPEN);
    expect(addOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'taker-buy-stp',
      }),
    );
  });

  it('should not match when price does not cross and add taker directly to orderbook', async () => {
    const takerBuy: Order = {
      id: 'taker-buy-no-cross',
      userId: 'user-taker',
      pair: 'ETH_USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '2900.00000000',
      amount: '1.00000000',
      filledAmount: '0.00000000',
      remainingAmount: '1.00000000',
      status: OrderStatus.OPEN,
      idempotencyKey: 'idemp-4',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const makerAsk: OrderbookEntry = {
      orderId: 'maker-ask-expensive',
      userId: 'user-maker',
      pair: 'ETH_USDT',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      price: '3000.00000000',
      amount: '1.00000000',
      remainingAmount: '1.00000000',
      createdAt: 1700000000,
    };

    getBestOpposingOrdersMock.mockResolvedValue([makerAsk]);

    const result = await service.match(takerBuy);

    expect(result.trades.length).toBe(0);
    expect(result.takerOrder.status).toBe(OrderStatus.OPEN);
    expect(result.takerOrder.remainingAmount).toBe('1.00000000');

    expect(addOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'taker-buy-no-cross',
        remainingAmount: '1.00000000',
      }),
    );
  });
});
