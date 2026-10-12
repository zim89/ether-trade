import { SHARED_ENV_DEFAULTS, SHARED_ENV_KEYS } from '@app/common/constants';
import { KAFKA_CLIENT_IDS } from '@app/common/kafka';

export const ENV_KEYS = {
  ...SHARED_ENV_KEYS,

  // App specific
  transfersGrpcUrl: 'TRANSFERS_GRPC_URL',
  transfersDatabaseUrl: 'TRANSFERS_DATABASE_URL',
  accountsGrpcUrl: 'ACCOUNTS_GRPC_URL',
  evmRpcUrl: 'EVM_RPC_URL',
  hotWalletPrivateKey: 'HOT_WALLET_PRIVATE_KEY',
  depositVaultAddress: 'DEPOSIT_VAULT_ADDRESS',
  usdtTokenAddress: 'USDT_TOKEN_ADDRESS',
  confirmations: 'CONFIRMATIONS',
} as const;

export const ENV_DEFAULTS = {
  ...SHARED_ENV_DEFAULTS,

  // App & service specific defaults
  transfersGrpcUrl: '0.0.0.0:50054',
  accountsGrpcUrl: '0.0.0.0:50052',
  dbName: 'transfers_db',
  evmRpcUrl: 'http://127.0.0.1:8545',
  hotWalletPrivateKey:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`,
  depositVaultAddress: '0x0165878a594ca255338adfa4d48449f69242eb8f' as `0x${string}`,
  usdtTokenAddress: '0xa513e6e4b8f2a923d98304ec87f64353c4d5c853' as `0x${string}`,
  confirmations: 0,
  kafkaClientId: KAFKA_CLIENT_IDS.transfers,
} as const;
