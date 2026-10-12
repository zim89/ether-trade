import { Currency } from '@app/common/constants';

export const TRANSFERS_TOKENS = {
  NATIVE_ETH_ADDRESS: '0x0000000000000000000000000000000000000000',
  NATIVE_ETH_DECIMALS: 18,
  USDT_DECIMALS: 6,
} as const;

export interface TokenConfig {
  currency: Currency;
  decimals: number;
}

export const TRANSFERS_LOGS = {
  scanner: {
    started: (rpcUrl: string, startBlock: number) =>
      `BlockScanner started on ${rpcUrl} from block ${startBlock}`,
    nodeResetDetected: (currentBlock: number, lastScanned: number) =>
      `⚠️ Anvil node reset detected (current: ${currentBlock} < last: ${lastScanned}). Resetting scanner cursor to block 0!`,
    scannedBatch: (fromBlock: number, toBlock: number, logsCount: number) =>
      `Scanned blocks [${fromBlock}..${toBlock}]: found ${logsCount} relevant deposit event(s)`,
  },
  deposit: {
    processed: (txHash: string, userId: string, amount: string, currency: string) =>
      `✅ Deposit processed: ${amount} ${currency} for user ${userId} (tx: ${txHash})`,
    rejected: (txHash: string, tokenAddress: string, reason: string) =>
      `❌ Deposit rejected: token ${tokenAddress} (tx: ${txHash}, reason: ${reason})`,
  },
  withdrawal: {
    requested: (id: string, userId: string, amount: string, currency: string) =>
      `Withdrawal requested: ID ${id}, user ${userId}, ${amount} ${currency}`,
    processing: (id: string, txHash: string) =>
      `On-chain withdrawal broadcast: ID ${id}, tx: ${txHash}`,
    completed: (id: string, txHash: string) => `✅ Withdrawal completed: ID ${id}, tx: ${txHash}`,
    failed: (id: string, reason: string) => `❌ Withdrawal failed: ID ${id}, reason: ${reason}`,
  },
} as const;

export const TRANSFERS_ERRORS = {
  invalidUserId: 'Invalid user ID format: must be a valid UUID',
  invalidAmount: 'Amount must be a positive decimal number',
  unsupportedCurrency: (currency: string) => `Unsupported currency for withdrawal: ${currency}`,
  invalidDestinationAddress: 'Destination address must be a valid 20-byte Ethereum address (0x...)',
  idempotencyKeyRequired: 'Idempotency key is required',
  withdrawalNotFound: (id: string) => `Withdrawal request not found: ${id}`,
  hotWalletLowBalance: 'Hot wallet has insufficient balance for withdrawal',
} as const;

export const MAX_BLOCK_RANGE = 2000;
