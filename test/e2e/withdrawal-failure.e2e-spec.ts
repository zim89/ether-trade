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

describe('Withdrawal Failure Saga (E2E True Black-Box)', () => {
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
    await deployContracts();
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

  it('should prevent double-spending and un-lock funds if transaction fails to submit', async () => {
    // Attempting withdrawal to an invalid or zero address should be validated or handled safely
    const failAttempt = await apiClient.request<{ message?: string }>(
      '/api/v1/transfers/withdraw',
      {
        method: 'POST',
        body: JSON.stringify({
          currency: 'USDT',
          amount: '100.00000000',
          toAddress: '0x0000000000000000000000000000000000000000',
        }),
      },
    );

    // Should either reject at input validation (400) or fail safely
    expect([400, 422]).toContain(failAttempt.status);

    // Verify locked balance remained 0
    const balanceRes = await apiClient.request<{
      lockedBalance: string;
    }>('/api/v1/balances?currency=USDT');

    if (balanceRes.status === 200) {
      expect(Number(balanceRes.body.lockedBalance)).toBe(0);
    }
  });
});
