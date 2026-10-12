import { createHash } from 'crypto';
import { Metadata } from '@grpc/grpc-js';
import { Injectable, Inject, Logger, OnModuleInit, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import BigNumber from 'bignumber.js';
import { firstValueFrom } from 'rxjs';
import { v7 as uuidv7 } from 'uuid';
import { Currency } from '@app/common/constants';
import type { AccountsServiceClient } from '@app/contracts';
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
  PROTO_SERVICES,
  SERVICE_CALLER_IDS,
} from '@app/contracts';
import type { Order } from '../database/schema/orders.schema';
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
    @Inject(PROTO_SERVICES.accounts)
    private readonly accountsClient: AccountsServiceClient,
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
   * Creates an order with two-phase balance locking outside DB transaction and Saga-Lite rollback.
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

    // 4. Local DB transaction: insert order into PostgreSQL
    let createdOrder: Order;
    try {
      createdOrder = await this.ordersRepository.create({
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
      });
    } catch (dbError: unknown) {
      // SAGA Compensation: unlock reserved funds in accounts-service
      this.logger.warn(`Order DB persistence failed. Initiating Saga compensation unlock.`);
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

    // 5. Match order against Orderbook via Matching Engine
    let finalOrder = createdOrder;
    try {
      const matchResult = await this.matchingEngineService.match(createdOrder);
      finalOrder = matchResult.takerOrder;
    } catch (matchErr: unknown) {
      this.logger.error(`Matching engine error: ${(matchErr as Error).message}`);
    }

    const orderItem = this.mapOrderToItem(finalOrder);

    // 6. Complete idempotency record
    await this.idempotencyRepository.completeRecord(idempotencyRecord.id, orderItem);

    this.logger.log(ORDERS_LOGS.orderCreated(finalOrder.id, userId, pair, side));
    return orderItem;
  }

  /**
   * Cancels an existing order, removes it from orderbook and unlocks remaining reserved funds.
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

    if ((existingOrder.status as OrderStatus) === OrderStatus.CANCELLED) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.orderAlreadyCancelled(orderId),
      });
    }

    if ((existingOrder.status as OrderStatus) === OrderStatus.FILLED) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.orderAlreadyFilled(orderId),
      });
    }

    const cancelledOrder = await this.ordersRepository.cancel(orderId, userId);
    if (!cancelledOrder) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.orderAlreadyFilled(orderId),
      });
    }

    // Remove from in-memory orderbook
    await this.orderbookService.removeOrder(
      orderId,
      cancelledOrder.pair,
      cancelledOrder.side as OrderSide,
    );

    // Unlock remaining reserved balance in accounts-service
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
    const order = await this.ordersRepository.findByIdAndUserId(request.orderId, request.userId);
    if (!order) {
      throw new RpcException({
        code: HttpStatus.NOT_FOUND,
        message: ORDERS_ERRORS.orderNotFound(request.orderId),
      });
    }
    return this.mapOrderToItem(order);
  }

  /**
   * Lists orders for a user with optional filtering and pagination.
   */
  async getOrders(request: GetOrdersRequest): Promise<{ orders: OrderItem[]; total: number }> {
    const { items, total } = await this.ordersRepository.findMany({
      userId: request.userId,
      pair: request.pair,
      status: request.status,
      limit: request.limit,
      offset: request.offset,
    });

    return {
      orders: items.map((o) => this.mapOrderToItem(o)),
      total,
    };
  }

  /**
   * Returns aggregated orderbook depth for a trading pair.
   */
  async getOrderBook(request: GetOrderBookRequest): Promise<GetOrderBookResponse> {
    if (!SUPPORTED_PAIRS.includes(request.pair as (typeof SUPPORTED_PAIRS)[number])) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.unsupportedPair(request.pair),
      });
    }

    return this.orderbookService.getOrderBook(request.pair, request.depth ?? 50);
  }

  private validateCreateOrderRequest(request: CreateOrderRequest): void {
    if (!SUPPORTED_PAIRS.includes(request.pair as (typeof SUPPORTED_PAIRS)[number])) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.unsupportedPair(request.pair),
      });
    }

    const price = new BigNumber(request.price);
    if (price.isNaN() || price.isLessThanOrEqualTo(0)) {
      throw new RpcException({
        code: HttpStatus.BAD_REQUEST,
        message: ORDERS_ERRORS.invalidPrice,
      });
    }

    const amount = new BigNumber(request.amount);
    if (amount.isNaN() || amount.isLessThanOrEqualTo(0)) {
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
