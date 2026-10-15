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
  ordersGrpcUrl: process.env[ENV_KEYS.ordersGrpcUrl] ?? ENV_DEFAULTS.ordersGrpcUrl,
  transfersGrpcUrl: process.env[ENV_KEYS.transfersGrpcUrl] ?? ENV_DEFAULTS.transfersGrpcUrl,
  grpcDefaultDeadlineMs: process.env[ENV_KEYS.grpcDefaultDeadlineMs]
    ? Number(process.env[ENV_KEYS.grpcDefaultDeadlineMs])
    : ENV_DEFAULTS.grpcDefaultDeadlineMs,
  ordersGrpcDeadlineMs: process.env[ENV_KEYS.ordersGrpcDeadlineMs]
    ? Number(process.env[ENV_KEYS.ordersGrpcDeadlineMs])
    : ENV_DEFAULTS.ordersGrpcDeadlineMs,
  wsPort: process.env[ENV_KEYS.wsPort] ? Number(process.env[ENV_KEYS.wsPort]) : undefined,
  wsPath: process.env[ENV_KEYS.wsPath] ?? ENV_DEFAULTS.wsPath,
  redisHost: process.env[ENV_KEYS.redisHost] ?? ENV_DEFAULTS.redisHost,
  redisPort: process.env[ENV_KEYS.redisPort]
    ? Number(process.env[ENV_KEYS.redisPort])
    : ENV_DEFAULTS.redisPort,
  redisPassword: process.env[ENV_KEYS.redisPassword] || undefined,
  kafkaBrokers: process.env[ENV_KEYS.kafkaBrokers] ?? ENV_DEFAULTS.kafkaBrokers,
  kafkaClientId: process.env[ENV_KEYS.kafkaClientId] ?? ENV_DEFAULTS.kafkaClientId,
  appEnv: process.env[ENV_KEYS.appEnv] ?? ENV_DEFAULTS.appEnv,
}));
