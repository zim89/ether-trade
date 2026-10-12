/**
 * @file deploy-contracts.ts
 * @description Local EVM environment initialization script for Anvil (Foundry).
 *
 * ### Purpose:
 * In local development, the Anvil EVM node runs in ephemeral in-memory state.
 * Unlike PostgreSQL or Redis, which can persist volumes, restarting the Anvil container
 * resets the blockchain to block 0 with no deployed contracts and 0 token balances.
 *
 * This script:
 * 1. Deploys the `DepositVault` smart contract (`deposit-vault.sol`).
 * 2. Deploys the `MockUSDT` (ERC-20, 6 decimals) smart contract (`mock-usdt.sol`).
 * 3. Mints initial dev liquidity (1,000,000 USDT) directly to the platform Hot Wallet
 *    to enable withdrawal settlements in `apps/transfers`.
 * 4. Prints deterministic contract addresses for verification and `.env` alignment.
 *
 * ### When to Run:
 * - **First-time setup:** After launching local Docker services (`pnpm docker:up`).
 * - **After Docker restart:** Whenever the `ether-trade-anvil` container is restarted or recreated.
 * - **After smart contract changes:** Whenever `smart-contracts/*.sol` are modified and recompiled (`pnpm contracts:build`).
 *
 * ### CLI Command:
 * ```bash
 * pnpm contracts:deploy
 * ```
 */

import { createPublicClient, createWalletClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import {
  DEPOSIT_VAULT_ABI,
  DEPOSIT_VAULT_BYTECODE,
  MOCK_USDT_ABI,
  MOCK_USDT_BYTECODE,
} from '@app/contracts';

/**
 * Anvil default genesis accounts:
 * Account #0: Deployer & Hot Wallet (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
 * Account #1: Test Trader (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
 */
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545';
const DEPLOYER_PRIVATE_KEY =
  (process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`) ||
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

async function deployContracts() {
  console.log('🚀 Connecting to Anvil at:', ANVIL_RPC_URL);

  const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
  const client = createPublicClient({
    chain: foundry,
    transport: http(ANVIL_RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: foundry,
    transport: http(ANVIL_RPC_URL),
  });

  const chainId = await client.getChainId();
  const blockNumber = await client.getBlockNumber();
  const balance = await client.getBalance({ address: account.address });

  console.log(`📡 Connected to Chain ID: ${chainId}, Block: ${blockNumber}`);
  console.log(`🔑 Deployer & Hot Wallet: ${account.address} (${formatEther(balance)} ETH)`);

  // 1. Deploy DepositVault
  console.log('\n📦 Deploying DepositVault...');
  const vaultDeployTxHash = await walletClient.deployContract({
    abi: DEPOSIT_VAULT_ABI,
    bytecode: DEPOSIT_VAULT_BYTECODE,
  });
  console.log(`⏳ DepositVault Tx: ${vaultDeployTxHash}`);
  const vaultReceipt = await client.waitForTransactionReceipt({ hash: vaultDeployTxHash });
  const vaultAddress = vaultReceipt.contractAddress;
  if (!vaultAddress) {
    throw new Error('Failed to deploy DepositVault: contract address is missing in receipt');
  }
  console.log(`✅ DepositVault deployed at: ${vaultAddress}`);

  // 2. Deploy MockUSDT
  console.log('\n📦 Deploying MockUSDT (ERC-20, 6 decimals)...');
  const usdtDeployTxHash = await walletClient.deployContract({
    abi: MOCK_USDT_ABI,
    bytecode: MOCK_USDT_BYTECODE,
  });
  console.log(`⏳ MockUSDT Tx: ${usdtDeployTxHash}`);
  const usdtReceipt = await client.waitForTransactionReceipt({ hash: usdtDeployTxHash });
  const usdtAddress = usdtReceipt.contractAddress;
  if (!usdtAddress) {
    throw new Error('Failed to deploy MockUSDT: contract address is missing in receipt');
  }
  console.log(`✅ MockUSDT deployed at: ${usdtAddress}`);

  // 3. Mint extra liquidity (1,000,000 USDT) directly to Hot Wallet
  console.log('\n💵 Ensuring Hot Wallet has initial USDT liquidity (1,000,000 USDT)...');
  const mintTxHash = await walletClient.writeContract({
    address: usdtAddress,
    abi: MOCK_USDT_ABI,
    functionName: 'mint',
    args: [account.address, 1_000_000n * 10n ** 6n],
  });
  await client.waitForTransactionReceipt({ hash: mintTxHash });

  // 4. Read balances
  const hotWalletUsdtBalance = (await client.readContract({
    address: usdtAddress,
    abi: MOCK_USDT_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })) as bigint;

  console.log(
    `💰 Hot Wallet USDT balance: ${(Number(hotWalletUsdtBalance) / 10 ** 6).toLocaleString()} USDT`,
  );

  console.log('\n✨ Deployment Summary:');
  console.log('----------------------------------------------------');
  console.log(`DepositVault: ${vaultAddress}`);
  console.log(`MockUSDT:     ${usdtAddress}`);
  console.log(`Hot Wallet:   ${account.address}`);
  console.log('----------------------------------------------------');

  return {
    vaultAddress,
    usdtAddress,
    hotWalletAddress: account.address,
  };
}

void deployContracts()
  .then(() => {
    console.log('\n🎉 Deploy script completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Deploy script failed:', err);
    process.exit(1);
  });
