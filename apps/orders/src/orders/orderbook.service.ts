import { Injectable, Logger } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { OrderSide, OrderBookLevel, GetOrderBookResponse } from '@app/contracts';
import { RedisService } from '../redis/redis.service';
import { ORDER_REDIS_KEYS, ORDERS_LOGS } from './orders.constants';
import { OrderbookEntry } from './orders.types';

@Injectable()
export class OrderbookService {
  private readonly logger = new Logger(OrderbookService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Adds an order into the Valkey/Redis orderbook and caches its details hash.
   */
  async addOrder(entry: OrderbookEntry): Promise<void> {
    const zsetKey =
      entry.side === OrderSide.BUY
        ? ORDER_REDIS_KEYS.orderbookBids(entry.pair)
        : ORDER_REDIS_KEYS.orderbookAsks(entry.pair);
    const detailsKey = ORDER_REDIS_KEYS.orderDetails(entry.orderId);

    const priceNum = new BigNumber(entry.price).toNumber();

    await this.redisService.execute('zadd', (client) =>
      client.zadd(zsetKey, { [entry.orderId]: priceNum }),
    );
    await this.redisService.execute('hset', (client) =>
      client.hset(detailsKey, {
        orderId: entry.orderId,
        userId: entry.userId,
        pair: entry.pair,
        side: entry.side,
        type: entry.type,
        price: entry.price,
        amount: entry.amount,
        remainingAmount: entry.remainingAmount,
        createdAt: entry.createdAt.toString(),
      }),
    );
  }

  /**
   * Updates the remaining amount of an order in the Redis hash.
   */
  async updateRemainingAmount(orderId: string, remainingAmount: string): Promise<void> {
    const detailsKey = ORDER_REDIS_KEYS.orderDetails(orderId);
    await this.redisService.execute('hset', (client) =>
      client.hset(detailsKey, { remainingAmount }),
    );
  }

  /**
   * Removes an order from the orderbook ZSET and deletes its details hash.
   */
  async removeOrder(orderId: string, pair: string, side: OrderSide): Promise<void> {
    const zsetKey =
      side === OrderSide.BUY
        ? ORDER_REDIS_KEYS.orderbookBids(pair)
        : ORDER_REDIS_KEYS.orderbookAsks(pair);
    const detailsKey = ORDER_REDIS_KEYS.orderDetails(orderId);

    await this.redisService.execute('zrem', (client) => client.zrem(zsetKey, [orderId]));
    await this.redisService.execute('del', (client) => client.del([detailsKey]));
  }

  /**
   * Retrieves order details from its Redis hash.
   */
  async getOrderDetails(orderId: string): Promise<OrderbookEntry | null> {
    const client = await this.redisService.getClient();
    const detailsKey = ORDER_REDIS_KEYS.orderDetails(orderId);
    const rawHash = await client.hgetall(detailsKey);

    if (!rawHash || rawHash.length === 0) {
      return null;
    }

    const hash = Object.fromEntries(
      rawHash.map((item) => [item.field.toString(), item.value.toString()]),
    );

    if (!hash.orderId) {
      return null;
    }

    return {
      orderId: hash.orderId,
      userId: hash.userId,
      pair: hash.pair,
      side: hash.side as OrderSide,
      type: hash.type as OrderbookEntry['type'],
      price: hash.price,
      amount: hash.amount,
      remainingAmount: hash.remainingAmount,
      createdAt: parseInt(hash.createdAt, 10),
    };
  }

  /**
   * Returns the best opposing orders from the orderbook.
   * For BUY taker: gets lowest asks (ascending by price).
   * For SELL taker: gets highest bids (descending by price).
   */
  async getBestOpposingOrders(
    pair: string,
    takerSide: OrderSide,
    limit = 50,
  ): Promise<OrderbookEntry[]> {
    const client = await this.redisService.getClient();
    const isTakerBuy = takerSide === OrderSide.BUY;
    const opposingZsetKey = isTakerBuy
      ? ORDER_REDIS_KEYS.orderbookAsks(pair)
      : ORDER_REDIS_KEYS.orderbookBids(pair);

    // If taker is BUY, opposing asks are sorted ascending (lowest price first -> reverse: false)
    // If taker is SELL, opposing bids are sorted descending (highest price first -> reverse: true)
    const orderIds = (await client.zrange(
      opposingZsetKey,
      { start: 0, end: limit - 1 },
      { reverse: !isTakerBuy },
    )) as string[];

    if (!orderIds || orderIds.length === 0) {
      return [];
    }

    const entries: OrderbookEntry[] = [];
    for (const orderId of orderIds) {
      const details = await this.getOrderDetails(orderId);
      if (details) {
        entries.push(details);
      }
    }

    return entries;
  }

  /**
   * Constructs the aggregated orderbook (depth) for a pair.
   */
  /**
   * Generates next monotonic sequence ID for orderbook pair.
   */
  async nextSequence(pair: string): Promise<number> {
    const client = await this.redisService.getClient();
    const seqKey = ORDER_REDIS_KEYS.orderbookSequence(pair);
    const result = (await client.customCommand(['INCR', seqKey])) as number | string;
    return typeof result === 'number' ? result : parseInt(result, 10);
  }

  /**
   * Gets current sequence ID for orderbook pair.
   */
  async getSequence(pair: string): Promise<number> {
    const client = await this.redisService.getClient();
    const seqKey = ORDER_REDIS_KEYS.orderbookSequence(pair);
    const result = (await client.customCommand(['GET', seqKey])) as string | null;
    return result ? parseInt(result, 10) : 0;
  }

  /**
   * Calculates aggregate remaining quantity at a specific price level for a pair and side.
   */
  async getLevelTotalQuantity(pair: string, side: OrderSide, price: string): Promise<string> {
    const client = await this.redisService.getClient();
    const zsetKey =
      side === OrderSide.BUY
        ? ORDER_REDIS_KEYS.orderbookBids(pair)
        : ORDER_REDIS_KEYS.orderbookAsks(pair);

    const priceNum = new BigNumber(price).toNumber();
    const orderIds = (await client.zrange(
      zsetKey,
      { start: 0, end: 500 },
      { reverse: false },
    )) as string[];

    if (!orderIds || orderIds.length === 0) {
      return '0';
    }

    let total = new BigNumber(0);
    for (const orderId of orderIds) {
      const details = await this.getOrderDetails(orderId);
      if (details && new BigNumber(details.price).isEqualTo(priceNum)) {
        total = total.plus(new BigNumber(details.remainingAmount));
      }
    }

    return total.toFixed(8);
  }

  /**
   * Constructs the aggregated orderbook (depth) for a pair.
   */
  async getOrderBook(pair: string, depth = 50): Promise<GetOrderBookResponse> {
    const client = await this.redisService.getClient();
    const bidsKey = ORDER_REDIS_KEYS.orderbookBids(pair);
    const asksKey = ORDER_REDIS_KEYS.orderbookAsks(pair);

    // Bids: highest price first
    const bidOrderIds = (await client.zrange(
      bidsKey,
      { start: 0, end: depth * 2 - 1 },
      { reverse: true },
    )) as string[];

    // Asks: lowest price first
    const askOrderIds = (await client.zrange(
      asksKey,
      { start: 0, end: depth * 2 - 1 },
      { reverse: false },
    )) as string[];

    const bids = await this.aggregateLevels(bidOrderIds, depth);
    const asks = await this.aggregateLevels(askOrderIds, depth);
    const sequenceId = await this.getSequence(pair);

    return {
      pair,
      bids,
      asks,
      timestamp: Math.floor(Date.now() / 1000),
      sequenceId,
    };
  }

  /**
   * Rehydrates orderbook from active database orders during startup.
   */
  async rehydrate(activeOrders: OrderbookEntry[]): Promise<void> {
    for (const order of activeOrders) {
      await this.addOrder(order);
    }
    this.logger.log(ORDERS_LOGS.orderbookRehydrated(activeOrders.length, 'ALL'));
  }

  /**
   * Aggregates individual order book entries into price levels.
   */
  private async aggregateLevels(orderIds: string[], maxDepth: number): Promise<OrderBookLevel[]> {
    if (!orderIds || orderIds.length === 0) {
      return [];
    }

    const priceMap = new Map<string, { amount: BigNumber; count: number }>();

    for (const orderId of orderIds) {
      const details = await this.getOrderDetails(orderId);
      if (!details) continue;

      const current = priceMap.get(details.price);
      if (current) {
        current.amount = current.amount.plus(new BigNumber(details.remainingAmount));
        current.count += 1;
      } else {
        priceMap.set(details.price, {
          amount: new BigNumber(details.remainingAmount),
          count: 1,
        });
      }
    }

    const levels: OrderBookLevel[] = [];
    for (const [price, data] of priceMap.entries()) {
      levels.push({
        price,
        amount: data.amount.toFixed(8),
        orderCount: data.count,
      });
      if (levels.length >= maxDepth) break;
    }

    return levels;
  }
}
