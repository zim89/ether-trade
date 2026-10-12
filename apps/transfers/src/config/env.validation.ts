import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { NodeEnv } from '@app/common/constants';
import { validateEnv } from '@app/common/utils';
import { ENV_DEFAULTS } from '../common/constants';

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = ENV_DEFAULTS.nodeEnv;

  @IsString()
  @IsNotEmpty()
  TRANSFERS_GRPC_URL: string = ENV_DEFAULTS.transfersGrpcUrl;

  @IsString()
  @IsNotEmpty()
  ACCOUNTS_GRPC_URL: string = ENV_DEFAULTS.accountsGrpcUrl;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsString()
  @IsNotEmpty()
  DB_HOST: string = ENV_DEFAULTS.dbHost;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  DB_PORT: number = ENV_DEFAULTS.dbPort;

  @IsString()
  @IsNotEmpty()
  DB_USER: string = ENV_DEFAULTS.dbUser;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME: string = ENV_DEFAULTS.dbName;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  DB_MAX_CONNECTIONS: number = ENV_DEFAULTS.dbMaxConnections;

  @IsString()
  @IsNotEmpty()
  EVM_RPC_URL: string = ENV_DEFAULTS.evmRpcUrl;

  @IsString()
  @IsNotEmpty()
  HOT_WALLET_PRIVATE_KEY: `0x${string}` = ENV_DEFAULTS.hotWalletPrivateKey;

  @IsString()
  @IsNotEmpty()
  DEPOSIT_VAULT_ADDRESS: `0x${string}` = ENV_DEFAULTS.depositVaultAddress;

  @IsString()
  @IsNotEmpty()
  USDT_TOKEN_ADDRESS: `0x${string}` = ENV_DEFAULTS.usdtTokenAddress;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  CONFIRMATIONS: number = ENV_DEFAULTS.confirmations;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  return validateEnv(EnvironmentVariables, config);
}
