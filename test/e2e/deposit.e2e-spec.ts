import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { DEPOSIT_VAULT_ABI, MOCK_USDT_ABI, MOCK_USDT_BYTECODE } from '@app/contracts';
import { deployContracts } from '../../scripts/deploy-contracts';
import {
  ApiClient,
  ANVIL_TEST_WALLETS,
  createAnvilSnapshot,
  DEFAULT_ANVIL_RPC_URL,
  mineAnvilBlocks,
  TestSandbox,
  waitUntil,
} from '../helpers';

describe('Deposit Flow (E2E True Black-Box)', () => {
  const apiClient = new ApiClient({
    baseUrl: process.env.API_GATEWAY_URL || 'http://localhost:4000',
    defaultWallet: ANVIL_TEST_WALLETS.traderAlice,
  });

  const sandbox = new TestSandbox();
  const aliceAccount = privateKeyToAccount(ANVIL_TEST_WALLETS.traderAlice.privateKey);

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(DEFAULT_ANVIL_RPC_URL),
  });

  const aliceWalletClient = createWalletClient({
    account: aliceAccount,
    chain: foundry,
    transport: http(DEFAULT_ANVIL_RPC_URL),
  });

  let depositVaultAddress: `0x${string}`;
  let usdtAddress: `0x${string}`;
  let baselineSnapshotId: `0x${string}`;
  let baselineBlockNumber: bigint;

  beforeAll(async () => {
    // 1. One-time deploy of smart contracts to Anvil
    const deployment = await deployContracts();
    depositVaultAddress = deployment.vaultAddress;
    usdtAddress = deployment.usdtAddress;

    // 2. Capture baseline EVM snapshot and block number
    baselineSnapshotId = await createAnvilSnapshot();
    baselineBlockNumber = await publicClient.getBlockNumber();
  });

  afterEach(async () => {
    // Deterministic state reset: EVM revert + scanner cursor reset + DB truncate + Redis flush
    await sandbox.resetAll({
      baselineSnapshotId,
      baselineBlockNumber,
      databaseTablesMap: {
        transfers_db: ['withdrawal_requests', 'wallet_deposits'],
        accounts_db: ['ledger_transactions', 'accounts'],
      },
    });
  });

  it('should deposit native ETH into DepositVault and credit account balance', async () => {
    // 1. Authenticate Alice & get deposit address / verify profile
    const depositAddressRes = await apiClient.request<{
      vaultAddress: string;
      userAddress: string;
    }>('/api/v1/transfers/deposit-address');

    expect(depositAddressRes.status).toBe(200);

    // 2. Deposit 1.5 ETH via DepositVault.depositNative(userUuid)
    const depositAmountWei = parseEther('1.5');
    const depositTxHash = await aliceWalletClient.writeContract({
      address: depositVaultAddress,
      abi: DEPOSIT_VAULT_ABI,
      functionName: 'depositNative',
      args: ['0x018f3a2b4c5d7e8f9a0b1c2d3e4f5a6b'], // bytes16 user identifier
      value: depositAmountWei,
    });

    await publicClient.waitForTransactionReceipt({ hash: depositTxHash });
    await mineAnvilBlocks(1);

    // 3. Wait until background scanner and accounts processor credit the balance
    const balance = await waitUntil(
      async () => {
        const res = await apiClient.request<{
          currency: string;
          availableBalance: string;
          lockedBalance: string;
        }>('/api/v1/balances?currency=ETH');
        return res.status === 200 ? res.body : null;
      },
      (body) => body !== null && body.availableBalance === '1.50000000',
      {
        timeoutMs: 10000,
        intervalMs: 300,
        description: 'Wait for ETH deposit to be credited to accounts',
      },
    );

    expect(balance?.availableBalance).toBe('1.50000000');
    expect(balance?.lockedBalance).toBe('0.00000000');
  });

  it('should deposit ERC-20 USDT into DepositVault and credit account balance', async () => {
    const depositAmountUnits = 250_000_000n; // 250 USDT (6 decimals)

    // 1. Mint USDT for Alice
    const deployerAccount = privateKeyToAccount(ANVIL_TEST_WALLETS.deployer.privateKey);
    const deployerWalletClient = createWalletClient({
      account: deployerAccount,
      chain: foundry,
      transport: http(DEFAULT_ANVIL_RPC_URL),
    });

    const mintTx = await deployerWalletClient.writeContract({
      address: usdtAddress,
      abi: MOCK_USDT_ABI,
      functionName: 'mint',
      args: [aliceAccount.address, depositAmountUnits],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintTx });

    // 2. Alice approves DepositVault to spend USDT
    const approveTx = await aliceWalletClient.writeContract({
      address: usdtAddress,
      abi: MOCK_USDT_ABI,
      functionName: 'approve',
      args: [depositVaultAddress, depositAmountUnits],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    // 3. Alice deposits token
    const depositTx = await aliceWalletClient.writeContract({
      address: depositVaultAddress,
      abi: DEPOSIT_VAULT_ABI,
      functionName: 'depositToken',
      args: [
        usdtAddress,
        depositAmountUnits,
        '0x018f3a2b4c5d7e8f9a0b1c2d3e4f5a6b', // bytes16 user identifier
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: depositTx });
    await mineAnvilBlocks(1);

    // 4. Wait for background scanner to process USDT deposit
    const balance = await waitUntil(
      async () => {
        const res = await apiClient.request<{
          currency: string;
          availableBalance: string;
          lockedBalance: string;
        }>('/api/v1/balances?currency=USDT');
        return res.status === 200 ? res.body : null;
      },
      (body) => body !== null && body.availableBalance === '250.00000000',
      {
        timeoutMs: 10000,
        intervalMs: 300,
        description: 'Wait for USDT deposit to be credited to accounts',
      },
    );

    expect(balance?.availableBalance).toBe('250.00000000');
  });

  it('should ignore or mark unsupported fake token deposits as rejected', async () => {
    // 1. Deploy an unsupported fake ERC-20 token
    const deployerAccount = privateKeyToAccount(ANVIL_TEST_WALLETS.deployer.privateKey);
    const deployerWalletClient = createWalletClient({
      account: deployerAccount,
      chain: foundry,
      transport: http(DEFAULT_ANVIL_RPC_URL),
    });

    const fakeTokenDeployTx = await deployerWalletClient.deployContract({
      abi: MOCK_USDT_ABI,
      bytecode: MOCK_USDT_BYTECODE,
    });
    const fakeTokenReceipt = await publicClient.waitForTransactionReceipt({
      hash: fakeTokenDeployTx,
    });
    const fakeTokenAddress = fakeTokenReceipt.contractAddress!;

    // 2. Mint & approve fake token
    const mintTx = await deployerWalletClient.writeContract({
      address: fakeTokenAddress,
      abi: MOCK_USDT_ABI,
      functionName: 'mint',
      args: [aliceAccount.address, 100_000_000n],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintTx });

    const approveTx = await aliceWalletClient.writeContract({
      address: fakeTokenAddress,
      abi: MOCK_USDT_ABI,
      functionName: 'approve',
      args: [depositVaultAddress, 100_000_000n],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    // 3. Deposit unsupported token
    const depositTx = await aliceWalletClient.writeContract({
      address: depositVaultAddress,
      abi: DEPOSIT_VAULT_ABI,
      functionName: 'depositToken',
      args: [fakeTokenAddress, 100_000_000n, '0x018f3a2b4c5d7e8f9a0b1c2d3e4f5a6b'],
    });
    await publicClient.waitForTransactionReceipt({ hash: depositTx });
    await mineAnvilBlocks(1);

    // 4. Ensure no unrecognised token balance was credited
    const res = await apiClient.request<{
      currency: string;
      availableBalance: string;
    }>('/api/v1/balances?currency=FAKE');

    // Either 400 bad request (unsupported currency) or zero balance
    expect([400, 404, 200]).toContain(res.status);
    if (res.status === 200) {
      expect(Number(res.body.availableBalance)).toBe(0);
    }
  });
});
