import { createHash } from 'crypto';
import { Metadata } from '@grpc/grpc-js';
import { Injectable, Inject, Logger, OnModuleInit, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import BigNumber from 'bignumber.js';
import { firstValueFrom } from 'rxjs';
import { v7 as uuidv7 } from 'uuid';
import { Currency } from '@app/common/constants';
import type {
  AccountsServiceClient,
  OrderCancelledEvent,
  OrderFilledEvent,
  OrderPlacedEvent,
  TradeExecutedEvent,
} from '@app/contracts';
import {
  CancelOrderRequest,
  CreateOrderRequest,
  GetOrderBookRequest,
  GetOrderBookResponse,
  GetOrderRequest,
  GetOrdersRequest,
  GRPC_METADATA_KEYS,
  OrderItem,
  OrderSide,
  OrderStatus,
  OrderType,
  OutboxAggregateType,
  OutboxStatus,
  PROTO_SERVICES,
  SERVICE_CALLER_IDS,
} from '@app/contracts';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import type { Order } from '../database/schema/orders.schema';
import type { NewOutboxEvent } from '../database/schema/outbox-events.schema';
import { OutboxRepository } from '../outbox/outbox.repository';
import { IdempotencyRepository, IDEMPOTENCY_STATUS } from './idempotency.repository';
import { MatchingEngineService } from './matching-engine.service';
import { OrderbookService } from './orderbook.service';
import { ORDERS_ERRORS, ORDERS_LOGS, SUPPORTED_PAIRS } from './orders.constants';
import { OrdersRepository } from './orders.repository';
import { OrderbookEntry } from './orders.types';

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly idempotencyRepository: IdempotencyRepository,
    private readonly orderbookService: OrderbookService,
    private readonly matchingEngineService: MatchingEngineService,
    private readonly outboxRepository: OutboxRepository,
    @Inject(PROTO_SERVICES.accounts)
    private readonly accountsClient: AccountsServiceClient,
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Cold-start reconciliation: loads active orders from DB into Redis Orderbook.
   */
  async onModuleInit(): Promise<void> {
    try {
      const activeOrders = await this.ordersRepository.findActiveOrdersByPair();
      const entries: OrderbookEntry[] = activeOrders.map((order) => ({
        orderId: order.id,
        userId: order.userId,
        pair: order.pair,
        side: order.side as OrderSide,
        type: order.type as OrderType,
        price: order.price,
        amount: order.amount,
        remainingAmount: order.remainingAmount,
        createdAt: Math.floor(order.createdAt.getTime() / 1000),
      }));

      await this.orderbookService.rehydrate(entries);
      this.logger.log(ORDERS_LOGS.orderbookRehydrated(entries.length, 'ALL'));
    } catch (err: unknown) {
      this.logger.error(`Cold-start orderbook rehydration failed: ${(err as Error).message}`);
    }
  }

  /**
   * Creates an order with two-phase balance locking outside DB transaction,
   * single ACID Unit of Work for order persistence, matching and Outbox events,
   * and Saga-Lite rollback on database failures.
   */
  async createOrder(request: CreateOrderRequest): Promise<OrderItem> {
    const { userId, pair, side, type, price, amount, idempotencyKey } = request;

    this.validateCreateOrderRequest(request);

    const operation = 'CREATE_ORDER';
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ userId, pair, side, type, price, amount }))
      .digest('hex');

    // 1. Idempotency Check
    const existingRecord = await this.idempotencyRepository.findRecord(
      userId,
      operation,
      idempotencyKey,
    );

    if (existingRecord) {
      if (
        existingRecord.status === IDEMPOTENCY_STATUS.completed &&
        existingRecord.responsePayload
      ) {
        return existingRecord.responsePayload as OrderItem;
      }
      if (existingRecord.status === IDEMPOTENCY_STATUS.inProgress) {
        throw new RpcException({
          code: HttpStatus.CONFLICT,
          message: ORDERS_ERRORS.idempotencyInProgress,
        });
      }
      if (existingRecord.requestHash !== requestHash) {
        throw new RpcException({
          code: HttpStatus.BAD_REQUEST,
          message: ORDERS_ERRORS.idempotencyPayloadMismatch,
        });
      }
    }

    const idempotencyRecord = await this.idempotencyRepository.createRecord({
      userId,
      operation,
      key: idempotencyKey,
      requestHash,
      status: IDEMPOTENCY_STATUS.inProgress,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // 2. Determine lock currency and amount
    const [baseCurrency, quoteCurrency] = pair.split('_') as [Currency, Currency];
    const isBuy = (side as OrderSide) === OrderSide.BUY;
    const lockCurrency = isBuy ? quoteCurrency : baseCurrency;
    const lockAmount = isBuy
      ? new BigNumber(price).multipliedBy(new BigNumber(amount)).toFixed(8)
      : new BigNumber(amount).toFixed(8);

    const correlationId = uuidv7();
    const metadata = new Metadata();
    metadata.set(GRPC_METADATA_KEYS.serviceId, SERVICE_CALLER_IDS.ordersService);
    metadata.set(GRPC_METADATA_KEYS.callerId, userId);
    metadata.set(GRPC_METADATA_KEYS.correlationId, correlationId);

    // 3. Two-phase locking: Call accounts-service gRPC client outside DB transaction
    try {
      await firstValueFrom(
        this.accountsClient.lockBalance(
          {
            userId,
            amount: lockAmount,
            currency: lockCurrency,
            idempotencyKey: `lock:${idempotencyKey}`,
            referenceId: idempotencyKey,
          },
          metadata,
        ),
      );
    } catch (error: unknown) {
      await this.idempotencyRepository.failRecord(idempotencyRecord.id);
      throw new RpcException({
        code: HttpStatus.PAYMENT_REQUIRED,
        message:
          (error as Error).message || ORDERS_ERRORS.insufficientBalance(lockCurrency, lockAmount),
      });
    }

    // 4. Unit of Work: ACID Transaction combining order insertion, matching engine updates, and Outbox events
    let finalOrder: Order;
    try {
      finalOrder = await this.db.transaction(async (tx) => {
        // 4.1 Insert taker order into PostgreSQL
        const initialOrder = await this.ordersRepository.create(
          {
            userId,
            pair,
            side,
            type,
            price,
            amount,
            filledAmount: '0',
            remainingAmount: amount,
            status: OrderStatus.OPEN,
            idempotencyKey,
          },
          tx,
        );

        const outboxList: NewOutboxEvent[] = [];
        const now = Date.now();

        // 4.2 Generate next sequenceId and get level total quantity for orderbook update
        const sequenceId = await this.orderbookService.nextSequence(initialOrder.pair);
        const levelTotalQuantity = await this.orderbookService.getLevelTotalQuantity(
          initialOrder.pair,
          initialOrder.side as OrderSide,
          initialOrder.price,
        );

        // 4.3 Write OrderPlacedEvent to outbox_events
        const orderPlacedPayload: OrderPlacedEvent = {
          orderId: initialOrder.id,
          userId: initialOrder.userId,
          symbol: initialOrder.pair,
          side: initialOrder.side as OrderSide,
          type: initialOrder.type as OrderType,
          price: initialOrder.price,
          quantity: initialOrder.amount,
          levelTotalQuantity,
          sequenceId,
          timestamp: now,
        };

        outboxList.push({
          id: uuidv7(),
          aggregateType: OutboxAggregateType.ORDER,
          aggregateId: initialOrder.id,
          partitionKey: initialOrder.pair,
          eventType: 'order_placed',
          payload: {
            eventId: uuidv7(),
            eventType: 'order.placed',
            aggregateId: initialOrder.id,
            partitionKey: initialOrder.pair,
            timestamp: now,
            correlationId,
            payload: orderPlacedPayload,
          },
          status: OutboxStatus.PENDING,
          retryCount: 0,
        });

        // 4.4 Match against Orderbook within same transaction
        const matchResult = await this.matchingEngineService.match(initialOrder, tx);

        // 4.5 Record TradeExecutedEvent for each trade and OrderFilledEvent for filled orders
        for (const trade of matchResult.trades) {
          const tradeSequenceId = await this.orderbookService.nextSequence(trade.symbol);
          const tradeExecutedPayload: TradeExecutedEvent = {
            tradeId: trade.tradeId,
            buyOrderId: trade.buyOrderId,
            sellOrderId: trade.sellOrderId,
            buyerUserId: trade.buyerUserId,
            sellerUserId: trade.sellerUserId,
            symbol: trade.symbol,
            price: trade.price,
            quantity: trade.quantity,
            buyerLimitPrice: trade.buyerLimitPrice,
            buyerFee: trade.buyerFee,
            sellerFee: trade.sellerFee,
            sequenceId: tradeSequenceId,
            timestamp: now,
          };

          outboxList.push({
            id: uuidv7(),
            aggregateType: OutboxAggregateType.TRADE,
            aggregateId: trade.tradeId,
            partitionKey: trade.symbol,
            eventType: 'trade_executed',
            payload: {
              eventId: uuidv7(),
              eventType: 'matching.trade_executed',
              aggregateId: trade.tradeId,
              partitionKey: trade.symbol,
              timestamp: now,
              correlationId,
              payload: tradeExecutedPayload,
            },
            status: OutboxStatus.PENDING,
            retryCount: 0,
          });
        }

        // Check if taker is FILLED
        if (matchResult.takerOrder.status === OrderStatus.FILLED) {
          const takerFilledPayload: OrderFilledEvent = {
            orderId: matchResult.takerOrder.id,
            userId: matchResult.takerOrder.userId,
            symbol: matchResult.takerOrder.pair,
            filledPrice: matchResult.takerOrder.price,
            filledQuantity: matchResult.takerOrder.filledAmount,
            remainingQuantity: matchResult.takerOrder.remainingAmount,
            fee: '0',
            timestamp: now,
          };

          outboxList.push({
            id: uuidv7(),
            aggregateType: OutboxAggregateType.ORDER,
            aggregateId: matchResult.takerOrder.id,
            partitionKey: matchResult.takerOrder.pair,
            eventType: 'order_filled',
            payload: {
              eventId: uuidv7(),
              eventType: 'order.filled',
              aggregateId: matchResult.takerOrder.id,
              partitionKey: matchResult.takerOrder.pair,
              timestamp: now,
              correlationId,
              payload: takerFilledPayload,
            },
            status: OutboxStatus.PENDING,
            retryCount: 0,
          });
        }

        // Check each updated maker if it reached FILLED status
        for (const makerOrder of matchResult.makerOrdersUpdated) {
          if (makerOrder.status === OrderStatus.FILLED) {
            const makerFilledPayload: OrderFilledEvent = {
              orderId: makerOrder.id,
              userId: makerOrder.userId,
              symbol: makerOrder.pair,
              filledPrice: makerOrder.price,
              filledQuantity: makerOrder.filledAmount,
              remainingQuantity: makerOrder.remainingAmount,
              fee: '0',
              timestamp: now,
            };

            outboxList.push({
              id: uuidv7(),
              aggregateType: OutboxAggregateType.ORDER,
              aggregateId: makerOrder.id,
              partitionKey: makerOrder.pair,
              eventType: 'order_filled',
              payload: {
                eventId: uuidv7(),
                eventType: 'order.filled',
                aggregateId: makerOrder.id,
                partitionKey: makerOrder.pair,
                timestamp: now,
                correlationId,
                payload: makerFilledPayload,
              },
              status: OutboxStatus.PENDING,
              retryCount: 0,
            });
          }
        }

        // 4.5 Insert all outbox records in the single Unit of Work
        await this.outboxRepository.insertMany(outboxList, tx);

        return matchResult.takerOrder;
      });
    } catch (dbError: unknown) {
      // SAGA Compensation: unlock reserved funds in accounts-service
      this.logger.warn(`Order DB transaction failed. Initiating Saga compensation unlock.`);
      try {
        await firstValueFrom(
          this.accountsClient.unlockBalance(
            {
              userId,
              amount: lockAmount,
              currency: lockCurrency,
              idempotencyKey: `unlock:${idempotencyKey}`,
              referenceId: idempotencyKey,
            },
            metadata,
          ),
        );
      } catch (unlockErr: unknown) {
        this.logger.error(`Saga unlock compensation failed: ${(unlockErr as Error).message}`);
      }

      await this.idempotencyRepository.failRecord(idempotencyRecord.id);
      throw dbError;
    }

    const orderItem = this.mapOrderToItem(finalOrder);

    // 5. Complete idempotency record
    await this.idempotencyRepository.completeRecord(idempotencyRecord.id, orderItem);

    this.logger.log(ORDERS_LOGS.orderCreated(finalOrder.id, userId, pair, side));
    return orderItem;
  }

  /**
   * Cancels an existing order, removes it from orderbook, unlocks remaining reserved funds
   * via synchronous gRPC, and atomically writes OrderCancelledEvent to outbox_events.
   */
  async cancelOrder(request: CancelOrderRequest): Promise<OrderItem> {
    const { orderId, userId, idempotencyKey } = request;

    const existingOrder = await this.ordersRepository.findByIdAndUserId(orderId, userId);
    if (!existingOrder) {
      throw new RpcException({
        code: HttpStatus.NOT_FOUND,
        message: ORDERS_ERRORS.orderNotFound(orderId),
      });
    }

    if (existingOrder.status === OrderStatus.CANCELLED) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.orderAlreadyCancelled(orderId),
      });
    }

    if (existingOrder.status === OrderStatus.FILLED) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.orderAlreadyFilled(orderId),
      });
    }

    const correlationId = uuidv7();

    // 1. Remove from in-memory orderbook first to get accurate post-cancellation levelTotalQuantity
    await this.orderbookService.removeOrder(
      orderId,
      existingOrder.pair,
      existingOrder.side as OrderSide,
    );
    const sequenceId = await this.orderbookService.nextSequence(existingOrder.pair);
    const levelTotalQuantity = await this.orderbookService.getLevelTotalQuantity(
      existingOrder.pair,
      existingOrder.side as OrderSide,
      existingOrder.price,
    );

    // 2. Transactional cancellation in DB + OrderCancelledEvent in outbox
    const cancelledOrder = await this.db.transaction(async (tx) => {
      const updated = await this.ordersRepository.cancel(orderId, userId, tx);
      if (!updated) {
        throw new RpcException({
          code: HttpStatus.BAD_REQUEST,
          message: ORDERS_ERRORS.orderAlreadyFilled(orderId),
        });
      }

      const now = Date.now();
      const cancelPayload: OrderCancelledEvent = {
        orderId: updated.id,
        userId: updated.userId,
        symbol: updated.pair,
        price: updated.price,
        remainingQuantity: updated.remainingAmount,
        levelTotalQuantity,
        side: updated.side as OrderSide,
        sequenceId,
        reason: 'User cancelled',
        timestamp: now,
      };

      await this.outboxRepository.insert(
        {
          id: uuidv7(),
          aggregateType: OutboxAggregateType.ORDER,
          aggregateId: updated.id,
          partitionKey: updated.pair,
          eventType: 'order_cancelled',
          payload: {
            eventId: uuidv7(),
            eventType: 'order.cancelled',
            aggregateId: updated.id,
            partitionKey: updated.pair,
            timestamp: now,
            correlationId,
            payload: cancelPayload,
          },
          status: OutboxStatus.PENDING,
          retryCount: 0,
        },
        tx,
      );

      return updated;
    });

    // 3. Unlock remaining reserved balance in accounts-service synchronously for immediate UI reflection
    const [baseCurrency, quoteCurrency] = cancelledOrder.pair.split('_') as [Currency, Currency];
    const isBuy = (cancelledOrder.side as OrderSide) === OrderSide.BUY;
    const unlockCurrency = isBuy ? quoteCurrency : baseCurrency;
    const unlockAmount = isBuy
      ? new BigNumber(cancelledOrder.price)
          .multipliedBy(new BigNumber(cancelledOrder.remainingAmount))
          .toFixed(8)
      : new BigNumber(cancelledOrder.remainingAmount).toFixed(8);

    if (new BigNumber(unlockAmount).isGreaterThan(0)) {
      const metadata = new Metadata();
      metadata.set(GRPC_METADATA_KEYS.serviceId, SERVICE_CALLER_IDS.ordersService);
      metadata.set(GRPC_METADATA_KEYS.callerId, userId);
      metadata.set(GRPC_METADATA_KEYS.correlationId, correlationId);

      try {
        await firstValueFrom(
          this.accountsClient.unlockBalance(
            {
              userId,
              amount: unlockAmount,
              currency: unlockCurrency,
              idempotencyKey: `cancel:${idempotencyKey}`,
              referenceId: orderId,
            },
            metadata,
          ),
        );
      } catch (err: unknown) {
        this.logger.error(
          `Failed to unlock balance on order cancellation: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(ORDERS_LOGS.orderCancelled(orderId, userId));
    return this.mapOrderToItem(cancelledOrder);
  }

  /**
   * Retrieves single order by ID and user.
   */
  async getOrder(request: GetOrderRequest): Promise<OrderItem> {
    const { orderId, userId } = request;
    const order = await this.ordersRepository.findByIdAndUserId(orderId, userId);

    if (!order) {
      throw new RpcException({
        code: HttpStatus.NOT_FOUND,
        message: ORDERS_ERRORS.orderNotFound(orderId),
      });
    }

    return this.mapOrderToItem(order);
  }

  /**
   * Retrieves paginated orders for a user.
   */
  async getOrders(request: GetOrdersRequest): Promise<{ items: OrderItem[]; total: number }> {
    const { userId, pair, status, limit, offset } = request;

    const result = await this.ordersRepository.findMany({
      userId,
      pair: pair || undefined,
      status: (status as OrderStatus) || undefined,
      limit: limit || 20,
      offset: offset || 0,
    });

    return {
      items: result.items.map((order) => this.mapOrderToItem(order)),
      total: result.total,
    };
  }

  /**
   * Retrieves orderbook depth for a pair.
   */
  async getOrderBook(request: GetOrderBookRequest): Promise<GetOrderBookResponse> {
    const { pair, depth = 20 } = request;

    if (!SUPPORTED_PAIRS.includes(pair as (typeof SUPPORTED_PAIRS)[number])) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.unsupportedPair(pair),
      });
    }

    return this.orderbookService.getOrderBook(pair, depth);
  }

  private validateCreateOrderRequest(request: CreateOrderRequest): void {
    const { pair, price, amount } = request;

    if (!SUPPORTED_PAIRS.includes(pair as (typeof SUPPORTED_PAIRS)[number])) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.unsupportedPair(pair),
      });
    }

    const priceBn = new BigNumber(price);
    if (!priceBn.isFinite() || priceBn.isLessThanOrEqualTo(0)) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.invalidPrice,
      });
    }

    const amountBn = new BigNumber(amount);
    if (!amountBn.isFinite() || amountBn.isLessThanOrEqualTo(0)) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.invalidAmount,
      });
    }
  }

  private mapOrderToItem(order: Order): OrderItem {
    return {
      orderId: order.id,
      userId: order.userId,
      pair: order.pair,
      side: order.side,
      type: order.type,
      price: order.price,
      amount: order.amount,
      filledAmount: order.filledAmount,
      remainingAmount: order.remainingAmount,
      status: order.status,
      createdAt: Math.floor(order.createdAt.getTime() / 1000),
      updatedAt: Math.floor(order.updatedAt.getTime() / 1000),
    };
  }
}
