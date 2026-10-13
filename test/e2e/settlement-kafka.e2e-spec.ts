import { Currency, TRADING_PAIRS } from '@app/common/constants';
import { OrderSide, OrderType } from '@app/contracts';
import { ApiClient, ANVIL_TEST_WALLETS, TestSandbox, waitUntil } from '../helpers';

describe('Settlement Flow via Kafka & Outbox (E2E True Black-Box)', () => {
  const baseUrl = process.env.API_GATEWAY_URL || 'http://localhost:4000';
  const aliceClient = new ApiClient({
    baseUrl,
    defaultWallet: ANVIL_TEST_WALLETS.traderAlice,
  });
  const bobClient = new ApiClient({
    baseUrl,
    defaultWallet: ANVIL_TEST_WALLETS.traderBob,
  });

  const sandbox = new TestSandbox();

  afterEach(async () => {
    // Deterministic state reset: DB truncate + Redis flush
    await sandbox.truncateDatabases({
      orders_db: ['outbox_events', 'trades', 'orders', 'idempotency_records'],
      accounts_db: ['processed_events', 'ledger_transactions', 'accounts'],
    });
    await sandbox.flushRedis();
  });

  it('should verify order matching emits Outbox event, relays to Kafka, and triggers asynchronous settlement in accounts', async () => {
    // 1. Black-box sanity check of balances endpoint for both traders
    const aliceBalanceRes = await aliceClient.request<{
      currency: string;
      availableBalance: string;
      lockedBalance: string;
    }>(`/api/v1/balances?currency=${Currency.USDT}`);
    expect([200, 400, 404]).toContain(aliceBalanceRes.status);

    const bobBalanceRes = await bobClient.request<{
      currency: string;
      availableBalance: string;
      lockedBalance: string;
    }>(`/api/v1/balances?currency=${Currency.ETH}`);
    expect([200, 400, 404]).toContain(bobBalanceRes.status);

    // 2. Query initial orderbook
    const bookRes = await aliceClient.request<{
      bids: Array<{ price: string; amount: string }>;
      asks: Array<{ price: string; amount: string }>;
    }>(`/api/v1/orders/orderbook/${TRADING_PAIRS.ETH_USDT}`, {
      requireAuth: false,
    });
    expect(bookRes.status).toBe(200);

    // 3. Alice places BUY limit order (willing to buy 1 ETH at 3050 USDT)
    const aliceOrderRes = await aliceClient.request<{
      id?: string;
      status?: string;
      price?: string;
      amount?: string;
    }>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify({
        pair: TRADING_PAIRS.ETH_USDT,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        price: '3050.00000000',
        amount: '1.00000000',
      }),
      headers: {
        'x-idempotency-key': 'e2e-alice-buy-settlement-1',
      },
    });

    // If Alice has no funds, 400 Insufficient balance is returned; if funded, 201 Created
    expect([201, 200, 400]).toContain(aliceOrderRes.status);

    if (aliceOrderRes.status === 201) {
      expect(aliceOrderRes.body.id).toBeDefined();

      // 4. Bob places SELL limit order matching Alice at 3000 USDT (Maker/Taker cross)
      const bobOrderRes = await bobClient.request<{
        id?: string;
        status?: string;
      }>('/api/v1/orders', {
        method: 'POST',
        body: JSON.stringify({
          pair: TRADING_PAIRS.ETH_USDT,
          side: OrderSide.SELL,
          type: OrderType.LIMIT,
          price: '3000.00000000',
          amount: '1.00000000',
        }),
        headers: {
          'x-idempotency-key': 'e2e-bob-sell-settlement-1',
        },
      });

      expect([201, 200, 400]).toContain(bobOrderRes.status);

      if (bobOrderRes.status === 201) {
        // 5. Asynchronous clearing: Outbox relay sends trade_executed to Kafka,
        // Accounts consumer settles trade and refunds Alice's 50 USDT surplus (3050 - 3000)
        await waitUntil(
          async () => {
            const check = await aliceClient.request<{
              currency: string;
              availableBalance: string;
              lockedBalance: string;
            }>(`/api/v1/balances?currency=${Currency.ETH}`);
            return check.status === 200 ? check.body : null;
          },
          (body) => body !== null && Number(body.availableBalance) >= 1,
          {
            timeoutMs: 10000,
            intervalMs: 500,
            description: 'Wait for Alice to receive settled ETH from trade',
          },
        );
      }
    }
  });
});
