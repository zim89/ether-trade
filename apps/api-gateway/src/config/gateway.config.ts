import { registerAs } from '@nestjs/config';
import { CONFIG_NAMESPACES, NodeEnv } from '@app/common/constants';
import { ENV_DEFAULTS, ENV_KEYS } from '../common/constants';
import { GatewayConfig } from './config.types';

export const gatewayConfig = registerAs(CONFIG_NAMESPACES.gateway, (): GatewayConfig => ({
  nodeEnv: (process.env[ENV_KEYS.nodeEnv] as NodeEnv) ?? ENV_DEFAULTS.nodeEnv,
  port: process.env[ENV_KEYS.port] ? Number(process.env[ENV_KEYS.port]) : ENV_DEFAULTS.port,
  corsOrigin: process.env[ENV_KEYS.corsOrigin] ?? ENV_DEFAULTS.corsOrigin,
  cookieSecret: process.env[ENV_KEYS.cookieSecret] ?? ENV_DEFAULTS.cookieSecret,
  jwtSecret: process.env[ENV_KEYS.jwtSecret] ?? '',
  identityGrpcUrl: process.env[ENV_KEYS.identityGrpcUrl] ?? ENV_DEFAULTS.identityGrpcUrl,
  accountsGrpcUrl: process.env[ENV_KEYS.accountsGrpcUrl] ?? ENV_DEFAULTS.accountsGrpcUrl,
  grpcDefaultDeadlineMs: process.env[ENV_KEYS.grpcDefaultDeadlineMs]
    ? Number(process.env[ENV_KEYS.grpcDefaultDeadlineMs])
    : ENV_DEFAULTS.grpcDefaultDeadlineMs,
}));
