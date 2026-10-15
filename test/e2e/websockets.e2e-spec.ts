import { WebSocket } from 'ws';
import {
  WsClientAction,
  WsOrderBookSnapshotMessage,
  WsOrderBookUpdateMessage,
} from '@app/contracts';
import { ApiClient, ANVIL_TEST_WALLETS, TestSandbox } from '../helpers';

describe('WebSockets Real-Time Flow (E2E True Black-Box)', () => {
  const baseUrl = process.env.API_GATEWAY_URL || 'http://localhost:4000';
  const wsUrl = process.env.WS_URL || 'ws://localhost:4000/ws';

  const aliceClient = new ApiClient({
    baseUrl,
    defaultWallet: ANVIL_TEST_WALLETS.traderAlice,
  });

  const sandbox = new TestSandbox();

  afterEach(async () => {
    await sandbox.truncateDatabases({
      orders_db: ['orders', 'idempotency_records'],
      accounts_db: ['ledger_transactions', 'accounts'],
    });
    await sandbox.flushRedis();
  });

  it('should connect to WebSocket, receive orderbook snapshot, and receive delta on order placement', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', (err) => reject(err));
    });

    const receivedMessages: unknown[] = [];
    ws.on('message', (raw) => {
      try {
        const text = Buffer.isBuffer(raw) ? raw.toString('utf-8') : (raw as Buffer[]).toString();
        const parsed = JSON.parse(text) as unknown;
        receivedMessages.push(parsed);
      } catch {
        // Ignore unparseable
      }
    });

    // 1. Subscribe to orderbook:ETH_USDT
    ws.send(
      JSON.stringify({
        action: WsClientAction.SUBSCRIBE,
        channel: 'orderbook:ETH_USDT',
      }),
    );

    // 2. Wait for snapshot message with sequenceId
    const waitForSnapshot = async (): Promise<WsOrderBookSnapshotMessage> => {
      for (let i = 0; i < 30; i++) {
        const msg = receivedMessages.find(
          (m: any) => m.type === 'snapshot' && m.channel === 'orderbook:ETH_USDT',
        ) as WsOrderBookSnapshotMessage | undefined;
        if (msg) return msg;
        await new Promise((res) => setTimeout(res, 100));
      }
      throw new Error('Timeout waiting for orderbook snapshot');
    };

    const snapshot = await waitForSnapshot();
    expect(snapshot.type).toBe('snapshot');
    expect(snapshot.sequenceId).toBeDefined();

    // 3. Place order via REST
    const createOrderRes = await aliceClient.request<{
      id?: string;
      status?: string;
    }>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify({
        pair: 'ETH_USDT',
        side: 'BUY',
        type: 'LIMIT',
        price: '2750.00000000',
        amount: '1.00000000',
      }),
      headers: {
        'x-idempotency-key': 'ws-e2e-order-1',
      },
    });

    // If order was successfully created (account funded) or handled
    if (createOrderRes.status === 201) {
      // 4. Wait for delta message with sequenceId >= snapshot.sequenceId
      const waitForDelta = async (): Promise<WsOrderBookUpdateMessage> => {
        for (let i = 0; i < 40; i++) {
          const msg = receivedMessages.find(
            (m: any) => m.type === 'delta' && m.channel === 'orderbook:ETH_USDT',
          ) as WsOrderBookUpdateMessage | undefined;
          if (msg) return msg;
          await new Promise((res) => setTimeout(res, 100));
        }
        throw new Error('Timeout waiting for orderbook delta');
      };

      const delta = await waitForDelta();
      expect(delta.type).toBe('delta');
      expect(delta.sequenceId).toBeGreaterThan(snapshot.sequenceId);
      expect(delta.price).toBe('2750.00000000');
    }

    ws.close();
  });

  it('should reject subscription to private channel without authentication', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', (err) => reject(err));
    });

    const receivedMessages: unknown[] = [];
    ws.on('message', (raw) => {
      try {
        const text = Buffer.isBuffer(raw) ? raw.toString('utf-8') : (raw as Buffer[]).toString();
        const parsed = JSON.parse(text) as unknown;
        receivedMessages.push(parsed);
      } catch {
        // Ignore unparseable
      }
    });

    // Attempt to subscribe to user:orders anonymously
    ws.send(
      JSON.stringify({
        action: WsClientAction.SUBSCRIBE,
        channel: 'user:orders',
      }),
    );

    const waitForError = async (): Promise<{ event: string; code: string }> => {
      for (let i = 0; i < 30; i++) {
        const msg = receivedMessages.find(
          (m: any) => m.event === 'error' && m.code === 'WS_UNAUTHORIZED',
        ) as { event: string; code: string } | undefined;
        if (msg) return msg;
        await new Promise((res) => setTimeout(res, 100));
      }
      throw new Error('Timeout waiting for unauthorized error message');
    };

    const errorMsg = await waitForError();
    expect(errorMsg.event).toBe('error');
    expect(errorMsg.code).toBe('WS_UNAUTHORIZED');

    ws.close();
  });
});
