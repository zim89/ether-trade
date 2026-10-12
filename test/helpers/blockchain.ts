/**
 * @file blockchain.ts
 * @description Viem client wrappers for local Anvil EVM node control (snapshots, reverts, mining).
 */

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  type PublicClient,
  type TestClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { ANVIL_TEST_WALLETS, type TestWallet } from './test-wallets';

export const DEFAULT_ANVIL_RPC_URL = process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545';

/**
 * Creates a viem PublicClient connected to the Anvil node.
 */
export function getAnvilPublicClient(rpcUrl: string = DEFAULT_ANVIL_RPC_URL): PublicClient {
  return createPublicClient({
    chain: foundry,
    transport: http(rpcUrl),
  });
}

/**
 * Creates a viem TestClient connected to Anvil for node state manipulation (snapshot, revert, automine).
 */
export function getAnvilTestClient(rpcUrl: string = DEFAULT_ANVIL_RPC_URL): TestClient<'anvil'> {
  return createTestClient({
    chain: foundry,
    mode: 'anvil',
    transport: http(rpcUrl),
  });
}

/**
 * Creates a viem WalletClient for a specific test wallet.
 */
export function getAnvilWalletClient(
  wallet: TestWallet = ANVIL_TEST_WALLETS.deployer,
  rpcUrl: string = DEFAULT_ANVIL_RPC_URL,
): WalletClient {
  const account = privateKeyToAccount(wallet.privateKey);
  return createWalletClient({
    account,
    chain: foundry,
    transport: http(rpcUrl),
  });
}

/**
 * Creates a new EVM snapshot and returns its hex snapshot ID.
 */
export async function createAnvilSnapshot(
  rpcUrl: string = DEFAULT_ANVIL_RPC_URL,
): Promise<`0x${string}`> {
  const testClient = getAnvilTestClient(rpcUrl);
  return testClient.snapshot();
}

/**
 * Reverts the EVM state back to a previously saved snapshot ID.
 */
export async function revertAnvilSnapshot(
  snapshotId: `0x${string}`,
  rpcUrl: string = DEFAULT_ANVIL_RPC_URL,
): Promise<void> {
  const testClient = getAnvilTestClient(rpcUrl);
  await testClient.revert({ id: snapshotId });
}

/**
 * Configures Anvil automine mode.
 */
export async function setAnvilAutomine(
  enabled = true,
  rpcUrl: string = DEFAULT_ANVIL_RPC_URL,
): Promise<void> {
  const testClient = getAnvilTestClient(rpcUrl);
  await testClient.setAutomine(enabled);
}

/**
 * Forces Anvil to mine a specified number of blocks.
 */
export async function mineAnvilBlocks(
  blocks = 1,
  rpcUrl: string = DEFAULT_ANVIL_RPC_URL,
): Promise<void> {
  const testClient = getAnvilTestClient(rpcUrl);
  await testClient.mine({ blocks });
}
