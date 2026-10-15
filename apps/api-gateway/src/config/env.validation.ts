import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { NodeEnv } from '@app/common/constants';
import { validateEnv } from '@app/common/utils';
import { ENV_DEFAULTS } from '../common/constants';

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = ENV_DEFAULTS.nodeEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = ENV_DEFAULTS.port;

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = ENV_DEFAULTS.corsOrigin;

  @IsString()
  @IsNotEmpty()
  IDENTITY_GRPC_URL: string = ENV_DEFAULTS.identityGrpcUrl;

  @IsString()
  @IsNotEmpty()
  ACCOUNTS_GRPC_URL: string = ENV_DEFAULTS.accountsGrpcUrl;

  @IsString()
  @IsNotEmpty()
  ORDERS_GRPC_URL: string = ENV_DEFAULTS.ordersGrpcUrl;

  @IsString()
  @IsNotEmpty()
  TRANSFERS_GRPC_URL: string = ENV_DEFAULTS.transfersGrpcUrl;

  @IsString()
  @IsNotEmpty()
  COOKIE_SECRET: string = ENV_DEFAULTS.cookieSecret;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120000)
  @IsOptional()
  GRPC_DEFAULT_DEADLINE_MS: number = ENV_DEFAULTS.grpcDefaultDeadlineMs;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  WS_PORT?: number;

  @IsString()
  @IsOptional()
  WS_PATH: string = ENV_DEFAULTS.wsPath;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string = ENV_DEFAULTS.redisHost;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  REDIS_PORT: number = ENV_DEFAULTS.redisPort;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  @IsNotEmpty()
  KAFKA_BROKERS: string = ENV_DEFAULTS.kafkaBrokers;

  @IsString()
  @IsOptional()
  KAFKA_CLIENT_ID: string = ENV_DEFAULTS.kafkaClientId;

  @IsString()
  @IsOptional()
  APP_ENV: string = ENV_DEFAULTS.appEnv;
}

/**
 * Validates raw configuration dictionary against EnvironmentVariables schema.
 * Passed to ConfigModule.forRoot({ validate: validateEnvironment }).
 */
export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  return validateEnv(EnvironmentVariables, config);
}
