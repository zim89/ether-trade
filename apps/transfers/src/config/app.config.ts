import { registerAs } from '@nestjs/config';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import { ENV_DEFAULTS, ENV_KEYS } from '../common/constants';

export const appConfig = registerAs(CONFIG_NAMESPACES.app, () => ({
  nodeEnv: process.env[ENV_KEYS.nodeEnv] ?? ENV_DEFAULTS.nodeEnv,
  grpcUrl: process.env[ENV_KEYS.transfersGrpcUrl] ?? ENV_DEFAULTS.transfersGrpcUrl,
  accountsGrpcUrl: process.env[ENV_KEYS.accountsGrpcUrl] ?? ENV_DEFAULTS.accountsGrpcUrl,
  evmRpcUrl: process.env[ENV_KEYS.evmRpcUrl] ?? ENV_DEFAULTS.evmRpcUrl,
  hotWalletPrivateKey:
    (process.env[ENV_KEYS.hotWalletPrivateKey] as `0x${string}`) ??
    ENV_DEFAULTS.hotWalletPrivateKey,
  depositVaultAddress:
    (process.env[ENV_KEYS.depositVaultAddress] as `0x${string}`) ??
    ENV_DEFAULTS.depositVaultAddress,
  usdtTokenAddress:
    (process.env[ENV_KEYS.usdtTokenAddress] as `0x${string}`) ?? ENV_DEFAULTS.usdtTokenAddress,
  confirmations: parseInt(
    process.env[ENV_KEYS.confirmations] ?? `${ENV_DEFAULTS.confirmations}`,
    10,
  ),
}));
