import { OrderSide, OrderType } from '@app/contracts';
import { RedisService } from '../redis/redis.service';
import { OrderbookService } from './orderbook.service';
import { OrderbookEntry } from './orders.types';

describe('OrderbookService', () => {
  let service: OrderbookService;
  let mockRedisClient: {
    zadd: jest.Mock<Promise<void>, [string, Record<string, number>]>;
    hset: jest.Mock<Promise<void>, [string, Record<string, string>]>;
    zrem: jest.Mock<Promise<void>, [string, string[]]>;
    del: jest.Mock<Promise<void>, [string[]]>;
    hgetall: jest.Mock<Promise<{ field: string; value: string }[]>, [string]>;
    zrange: jest.Mock<
      Promise<string[]>,
      [string, { start: number; end: number }, { reverse?: boolean }?]
    >;
    customCommand: jest.Mock<Promise<any>, [string[]]>;
  };
  let mockRedisService: jest.Mocked<Partial<RedisService>>;

  // In-memory mock storage for ZSET and HASH
  let zsets: Map<string, Map<string, number>>;
  let hashes: Map<string, Record<string, string>>;

  beforeEach(() => {
    zsets = new Map();
    hashes = new Map();

    mockRedisClient = {
      zadd: jest.fn((key: string, scores: Record<string, number>) => {
        if (!zsets.has(key)) zsets.set(key, new Map());
        const set = zsets.get(key)!;
        for (const [member, score] of Object.entries(scores)) {
          set.set(member, score);
        }
        return Promise.resolve();
      }),

      hset: jest.fn((key: string, data: Record<string, string>) => {
        const current = hashes.get(key) || {};
        hashes.set(key, { ...current, ...data });
        return Promise.resolve();
      }),

      zrem: jest.fn((key: string, members: string[]) => {
        const set = zsets.get(key);
        if (set) {
          for (const m of members) set.delete(m);
        }
        return Promise.resolve();
      }),

      del: jest.fn((keys: string[]) => {
        for (const k of keys) hashes.delete(k);
        return Promise.resolve();
      }),

      hgetall: jest.fn((key: string) => {
        const h = hashes.get(key);
        if (!h) return Promise.resolve([]);
        return Promise.resolve(Object.entries(h).map(([field, value]) => ({ field, value })));
      }),

      zrange: jest.fn(
        (key: string, range: { start: number; end: number }, options?: { reverse?: boolean }) => {
          const set = zsets.get(key);
          if (!set) return Promise.resolve([]);
          const sorted = Array.from(set.entries()).sort((a, b) => {
            return options?.reverse ? b[1] - a[1] : a[1] - b[1];
          });
          const slice = sorted.slice(range.start, range.end + 1);
          return Promise.resolve(slice.map((item) => item[0]));
        },
      ),

      customCommand: jest.fn((args: string[]) => {
        const [cmd, key] = args;
        if (cmd === 'INCR') {
          const current = hashes.get('__sequences__')?.[key] || '0';
          const nextVal = (parseInt(current, 10) + 1).toString();
          const currMap = hashes.get('__sequences__') || {};
          hashes.set('__sequences__', { ...currMap, [key]: nextVal });
          return Promise.resolve(parseInt(nextVal, 10));
        }
        if (cmd === 'GET') {
          const val = hashes.get('__sequences__')?.[key] || null;
          return Promise.resolve(val);
        }
        return Promise.resolve(null);
      }),
    };

    mockRedisService = {
      getClient: jest.fn().mockResolvedValue(mockRedisClient as any),
      execute: jest.fn((_cmd: string, fn: (client: any) => Promise<any>) => fn(mockRedisClient)),
    };

    service = new OrderbookService(mockRedisService as RedisService);
  });

  describe('addOrder and getOrderDetails', () => {
    it('should add a BUY order to bids ZSET and store its details in hash', async () => {
      const entry: OrderbookEntry = {
        orderId: 'order-1',
        userId: 'user-1',
        pair: 'ETH_USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        price: '3000.00000000',
        amount: '1.00000000',
        remainingAmount: '1.00000000',
        createdAt: 1700000000,
      };

      await service.addOrder(entry);

      expect(mockRedisClient.zadd).toHaveBeenCalledWith('orderbook:buy:ETH_USDT', {
        'order-1': 3000,
      });
      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'order:order-1',
        expect.objectContaining({ orderId: 'order-1', price: '3000.00000000' }),
      );

      const retrieved = await service.getOrderDetails('order-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.orderId).toBe('order-1');
      expect(retrieved?.price).toBe('3000.00000000');
    });

    it('should add a SELL order to asks ZSET', async () => {
      const entry: OrderbookEntry = {
        orderId: 'order-2',
        userId: 'user-2',
        pair: 'ETH_USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        price: '3050.00000000',
        amount: '2.00000000',
        remainingAmount: '2.00000000',
        createdAt: 1700000001,
      };

      await service.addOrder(entry);

      expect(mockRedisClient.zadd).toHaveBeenCalledWith('orderbook:sell:ETH_USDT', {
        'order-2': 3050,
      });
    });
  });

  describe('getBestOpposingOrders (Price-Time / Ordering)', () => {
    it('should return lowest asks for a BUY taker (ascending price priority)', async () => {
      await service.addOrder({
        orderId: 'ask-1',
        userId: 'u1',
        pair: 'ETH_USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        price: '3100.00000000',
        amount: '1.00000000',
        remainingAmount: '1.00000000',
        createdAt: 1700000000,
      });

      await service.addOrder({
        orderId: 'ask-2',
        userId: 'u2',
        pair: 'ETH_USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        price: '3050.00000000',
        amount: '1.00000000',
        remainingAmount: '1.00000000',
        createdAt: 1700000001,
      });

      await service.addOrder({
        orderId: 'ask-3',
        userId: 'u3',
        pair: 'ETH_USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        price: '3200.00000000',
        amount: '1.00000000',
        remainingAmount: '1.00000000',
        createdAt: 1700000002,
      });

      const opposing = await service.getBestOpposingOrders('ETH_USDT', OrderSide.BUY);
      expect(opposing.length).toBe(3);
      expect(opposing[0].orderId).toBe('ask-2');
      expect(opposing[1].orderId).toBe('ask-1');
      expect(opposing[2].orderId).toBe('ask-3');
    });

    it('should return highest bids for a SELL taker (descending price priority)', async () => {
      await service.addOrder({
        orderId: 'bid-1',
        userId: 'u1',
        pair: 'ETH_USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        price: '3000.00000000',
        amount: '1.00000000',
        remainingAmount: '1.00000000',
        createdAt: 1700000000,
      });

      await service.addOrder({
        orderId: 'bid-2',
        userId: 'u2',
        pair: 'ETH_USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        price: '3020.00000000',
        amount: '1.00000000',
        remainingAmount: '1.00000000',
        createdAt: 1700000001,
      });

      await service.addOrder({
        orderId: 'bid-3',
        userId: 'u3',
        pair: 'ETH_USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        price: '2980.00000000',
        amount: '1.00000000',
        remainingAmount: '1.00000000',
        createdAt: 1700000002,
      });

      const opposing = await service.getBestOpposingOrders('ETH_USDT', OrderSide.SELL);
      expect(opposing.length).toBe(3);
      expect(opposing[0].orderId).toBe('bid-2');
      expect(opposing[1].orderId).toBe('bid-1');
      expect(opposing[2].orderId).toBe('bid-3');
    });
  });

  describe('updateRemainingAmount and removeOrder', () => {
    it('should update remaining amount in hash', async () => {
      await service.addOrder({
        orderId: 'order-update',
        userId: 'u1',
        pair: 'ETH_USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        price: '3000.00000000',
        amount: '2.00000000',
        remainingAmount: '2.00000000',
        createdAt: 1700000000,
      });

      await service.updateRemainingAmount('order-update', '0.50000000');
      const details = await service.getOrderDetails('order-update');
      expect(details?.remainingAmount).toBe('0.50000000');
    });

    it('should remove order from ZSET and delete its hash details', async () => {
      await service.addOrder({
        orderId: 'order-remove',
        userId: 'u1',
        pair: 'ETH_USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        price: '3000.00000000',
        amount: '1.00000000',
        remainingAmount: '1.00000000',
        createdAt: 1700000000,
      });

      await service.removeOrder('order-remove', 'ETH_USDT', OrderSide.BUY);
      const details = await service.getOrderDetails('order-remove');
      expect(details).toBeNull();
    });
  });

  describe('getOrderBook (Aggregated levels)', () => {
    it('should aggregate orders at the same price level into a single OrderBookLevel', async () => {
      await service.addOrder({
        orderId: 'bid-a',
        userId: 'u1',
        pair: 'ETH_USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        price: '3000.00000000',
        amount: '1.50000000',
        remainingAmount: '1.50000000',
        createdAt: 1700000000,
      });

      await service.addOrder({
        orderId: 'bid-b',
        userId: 'u2',
        pair: 'ETH_USDT',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        price: '3000.00000000',
        amount: '2.50000000',
        remainingAmount: '2.50000000',
        createdAt: 1700000001,
      });

      const book = await service.getOrderBook('ETH_USDT');
      expect(book.bids.length).toBe(1);
      expect(book.bids[0].price).toBe('3000.00000000');
      expect(book.bids[0].amount).toBe('4.00000000');
      expect(book.bids[0].orderCount).toBe(2);
    });
  });
});
