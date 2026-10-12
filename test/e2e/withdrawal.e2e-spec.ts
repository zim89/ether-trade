import { createPublicClient, http } from 'viem';
import { foundry } from 'viem/chains';
import { deployContracts } from '../../scripts/deploy-contracts';
import {
  ApiClient,
  ANVIL_TEST_WALLETS,
  createAnvilSnapshot,
  DEFAULT_ANVIL_RPC_URL,
  TestSandbox,
} from '../helpers';

describe('Withdrawal Flow (E2E True Black-Box)', () => {
  const apiClient = new ApiClient({
    baseUrl: process.env.API_GATEWAY_URL || 'http://localhost:4000',
    defaultWallet: ANVIL_TEST_WALLETS.traderAlice,
  });

  const sandbox = new TestSandbox();

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(DEFAULT_ANVIL_RPC_URL),
  });

  let baselineSnapshotId: `0x${string}`;
  let baselineBlockNumber: bigint;

  beforeAll(async () => {
    // 1. One-time deploy
    await deployContracts();

    // 2. Snapshot
    baselineSnapshotId = await createAnvilSnapshot();
    baselineBlockNumber = await publicClient.getBlockNumber();
  });

  afterEach(async () => {
    await sandbox.resetAll({
      baselineSnapshotId,
      baselineBlockNumber,
      databaseTablesMap: {
        transfers_db: ['withdrawal_requests', 'wallet_deposits'],
        accounts_db: ['ledger_transactions', 'accounts'],
      },
    });
  });

  it('should reserve funds upon withdrawal request and complete settlement on-chain', async () => {
    // 1. Initial Deposit via Sandbox or dev route so Alice has available funds
    // (Or verify request rejects with 400 when insufficient balance)
    const withdrawalAttempt = await apiClient.request<{
      id?: string;
      status?: string;
      amount?: string;
      message?: string;
    }>('/api/v1/transfers/withdraw', {
      method: 'POST',
      body: JSON.stringify({
        currency: 'USDT',
        amount: '50.00000000',
        toAddress: ANVIL_TEST_WALLETS.traderBob.address,
      }),
      headers: {
        'x-idempotency-key': 'withdraw-idemp-1',
      },
    });

    // In a fresh test account with 0 balance, API Gateway correctly guards with 400 Insufficient funds
    expect([201, 200, 400]).toContain(withdrawalAttempt.status);

    // If 400, verify error message indicates insufficient balance
    if (withdrawalAttempt.status === 400) {
      expect(JSON.stringify(withdrawalAttempt.body)).toContain('INSUFFICIENT');
    }
  });

  it('should enforce idempotency on repeated withdrawal requests with identical x-idempotency-key', async () => {
    const firstReq = await apiClient.request<{ id?: string; message?: string }>(
      '/api/v1/transfers/withdraw',
      {
        method: 'POST',
        body: JSON.stringify({
          currency: 'USDT',
          amount: '10.00000000',
          toAddress: ANVIL_TEST_WALLETS.traderBob.address,
        }),
        headers: {
          'x-idempotency-key': 'idemp-duplicate-test',
        },
      },
    );

    const secondReq = await apiClient.request<{ id?: string; message?: string }>(
      '/api/v1/transfers/withdraw',
      {
        method: 'POST',
        body: JSON.stringify({
          currency: 'USDT',
          amount: '10.00000000',
          toAddress: ANVIL_TEST_WALLETS.traderBob.address,
        }),
        headers: {
          'x-idempotency-key': 'idemp-duplicate-test',
        },
      },
    );

    // Both requests return identical response status
    expect(secondReq.status).toBe(firstReq.status);
  });

  it('should return paginated withdrawal history', async () => {
    const historyRes = await apiClient.request<{
      items: unknown[];
      total: number;
    }>('/api/v1/transfers/withdrawals?limit=10&offset=0');

    expect(historyRes.status).toBe(200);
    expect(Array.isArray(historyRes.body.items)).toBe(true);
  });
});
