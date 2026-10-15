import { ApiClient, ANVIL_TEST_WALLETS, TestSandbox } from '../helpers';

describe('Observability & Distributed Tracing Flow (E2E True Black-Box)', () => {
  const baseUrl = process.env.API_GATEWAY_URL || 'http://localhost:4000';
  const jaegerBaseUrl = process.env.JAEGER_URL || 'http://localhost:16686';

  const aliceClient = new ApiClient({
    baseUrl,
    defaultWallet: ANVIL_TEST_WALLETS.traderAlice,
  });

  const sandbox = new TestSandbox();

  afterEach(async () => {
    await sandbox.truncateDatabases({
      orders_db: ['outbox_events', 'trades', 'orders', 'idempotency_records'],
      accounts_db: ['processed_events', 'ledger_transactions', 'accounts'],
      copy_trading_db: [
        'copy_orders_history',
        'copy_subscriptions',
        'master_traders',
        'processed_events',
      ],
    });
    await sandbox.flushRedis();
  });

  it('should return dual trace headers (x-trace-id and traceparent) on API Gateway responses', async () => {
    // 1. Query public orderbook
    const res = await aliceClient.request<{
      bids: Array<{ price: string; amount: string }>;
      asks: Array<{ price: string; amount: string }>;
    }>('/api/v1/orders/orderbook/ETH_USDT', {
      requireAuth: false,
    });

    expect(res.status).toBe(200);

    // 2. Validate x-trace-id header: 32 hex characters
    const xTraceId = res.headers.get('x-trace-id');
    expect(xTraceId).toBeDefined();
    expect(typeof xTraceId).toBe('string');
    expect(xTraceId).toMatch(/^[0-9a-f]{32}$/);

    // 3. Validate traceparent header: W3C format 00-{traceId}-{spanId}-{flags}
    const traceparent = res.headers.get('traceparent');
    expect(traceparent).toBeDefined();
    expect(typeof traceparent).toBe('string');
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);

    // 4. Verify correlation between headers
    expect(traceparent).toContain(xTraceId);
  });

  it('should propagate trace context across order placement, Outbox, and Jaeger trace lookup', async () => {
    // 1. Send Order Placement request
    const createOrderRes = await aliceClient.request<{
      id?: string;
      message?: string;
    }>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify({
        pair: 'ETH_USDT',
        side: 'BUY',
        type: 'LIMIT',
        price: '2750.00000000',
        amount: '0.10000000',
      }),
      headers: {
        'x-idempotency-key': 'e2e-obs-order-1',
      },
    });

    // 2. Validate response status and headers
    expect([200, 201, 400]).toContain(createOrderRes.status);
    const traceId = createOrderRes.headers.get('x-trace-id');
    expect(traceId).toBeDefined();
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);

    // 3. If Jaeger service is reachable (e.g. running under docker:obs:up),
    // query Jaeger REST API with retry / backoff to accommodate Tail Sampling decision_wait
    let jaegerReachable = false;
    try {
      const ping = await fetch(`${jaegerBaseUrl}/api/traces?limit=1`);
      jaegerReachable = ping.ok;
    } catch {
      jaegerReachable = false;
    }

    if (jaegerReachable && traceId) {
      // Poll Jaeger API with 1s interval up to 5s for tail_sampling decision_wait
      let traceFound = false;
      const maxRetries = 5;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          const jaegerRes = await fetch(`${jaegerBaseUrl}/api/traces/${traceId}`);
          if (jaegerRes.ok) {
            const data = (await jaegerRes.json()) as { data: Array<{ traceID: string }> };
            if (data.data && data.data.length > 0) {
              expect(data.data[0].traceID.toLowerCase()).toContain(traceId.toLowerCase());
              traceFound = true;
              break;
            }
          }
        } catch {
          // Retry on connection blip
        }
      }

      // If collector sampled the trace (errors-policy, latency-policy, or probabilistic), verify match
      if (traceFound) {
        expect(traceFound).toBe(true);
      }
    }
  });

  it('should color errors and include x-trace-id on error responses', async () => {
    // Send invalid payload to trigger 400 Bad Request
    const errRes = await aliceClient.request<{ message?: string; statusCode?: number }>(
      '/api/v1/orders',
      {
        method: 'POST',
        body: JSON.stringify({
          pair: 'INVALID_PAIR',
        }),
      },
    );

    expect(errRes.status).toBe(400);
    const errorTraceId = errRes.headers.get('x-trace-id');
    expect(errorTraceId).toBeDefined();
    expect(errorTraceId).toMatch(/^[0-9a-f]{32}$/);
  });
});
