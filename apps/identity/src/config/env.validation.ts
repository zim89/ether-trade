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
  IDENTITY_GRPC_URL: string = ENV_DEFAULTS.identityGrpcUrl;

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
  REDIS_HOST: string = ENV_DEFAULTS.redisHost;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  REDIS_PORT: number = ENV_DEFAULTS.redisPort;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = ENV_DEFAULTS.jwtExpiresIn;
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  return validateEnv(EnvironmentVariables, config);
}
