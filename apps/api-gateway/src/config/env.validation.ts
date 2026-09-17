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
  COOKIE_SECRET: string = ENV_DEFAULTS.cookieSecret;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;
}

/**
 * Validates raw configuration dictionary against EnvironmentVariables schema.
 * Passed to ConfigModule.forRoot({ validate: validateEnvironment }).
 */
export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  return validateEnv(EnvironmentVariables, config);
}
