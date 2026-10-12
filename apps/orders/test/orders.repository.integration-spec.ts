import { OrderSide, OrderStatus, OrderType } from '@app/contracts';
import { DbTestContext } from '../../../test/helpers';
import * as schema from '../src/database/schema';
import { OrdersRepository } from '../src/orders/orders.repository';

describe('OrdersRepository (Integration)', () => {
  let context: DbTestContext<typeof schema>;
  let repository: OrdersRepository;

  const testUserId = '018f3a2b-4c5d-7e8f-9a0b-1c2d3e4f5a6b';

  beforeAll(async () => {
    // 1. Ensure isolated orders_test_db exists and migrations are executed
    await DbTestContext.ensureDatabaseExists('orders_test_db');
    context = new DbTestContext(
      {
        dbName: 'orders_test_db',
        migrationsFolder: 'apps/orders/src/database/migrations',
      },
      schema,
    );
    await context.runMigrations();

    repository = new OrdersRepository(context.db);
  });

  afterAll(async () => {
    // 2. Guaranteed close of connection pool to prevent open handle leaks
    if (context) {
      await context.close();
    }
  });

  beforeEach(async () => {
    // 3. Clean slate before each test case
    await context.truncateTables(['orders', 'idempotency_records']);
  });

  it('should create and retrieve an order by ID', async () => {
    const created = await repository.create({
      userId: testUserId,
      pair: 'ETH_USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '3000.00000000',
      amount: '2.00000000',
      filledAmount: '0.00000000',
      remainingAmount: '2.00000000',
      status: OrderStatus.OPEN,
      idempotencyKey: 'order-idemp-1',
    });

    expect(created).toBeDefined();
    expect(created.id).toBeDefined();

    const fetched = await repository.findById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.price).toBe('3000.00000000');
    expect(fetched?.amount).toBe('2.00000000');
    expect(fetched?.status).toBe(OrderStatus.OPEN);
  });

  it('should update execution amounts and status', async () => {
    const created = await repository.create({
      userId: testUserId,
      pair: 'ETH_USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '3000.00000000',
      amount: '2.00000000',
      filledAmount: '0.00000000',
      remainingAmount: '2.00000000',
      status: OrderStatus.OPEN,
      idempotencyKey: 'order-idemp-2',
    });

    const updated = await repository.updateExecution(created.id, {
      filledAmount: '1.00000000',
      remainingAmount: '1.00000000',
      status: OrderStatus.PARTIALLY_FILLED,
    });

    expect(updated).not.toBeNull();
    expect(updated?.filledAmount).toBe('1.00000000');
    expect(updated?.remainingAmount).toBe('1.00000000');
    expect(updated?.status).toBe(OrderStatus.PARTIALLY_FILLED);
  });

  it('should find active orders for orderbook rehydration', async () => {
    await repository.create({
      userId: testUserId,
      pair: 'ETH_USDT',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '2900.00000000',
      amount: '1.00000000',
      filledAmount: '0.00000000',
      remainingAmount: '1.00000000',
      status: OrderStatus.OPEN,
      idempotencyKey: 'active-1',
    });

    await repository.create({
      userId: testUserId,
      pair: 'ETH_USDT',
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      price: '3100.00000000',
      amount: '1.00000000',
      filledAmount: '1.00000000',
      remainingAmount: '0.00000000',
      status: OrderStatus.FILLED, // FILLED is not active
      idempotencyKey: 'filled-1',
    });

    const activeOrders = await repository.findActiveOrdersByPair('ETH_USDT');
    expect(activeOrders.length).toBe(1);
    expect(activeOrders[0].price).toBe('2900.00000000');
  });
});
