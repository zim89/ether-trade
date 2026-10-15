import { SHARED_ENV_DEFAULTS, SHARED_ENV_KEYS } from '@app/common/constants';

export const ENV_KEYS = {
  ...SHARED_ENV_KEYS,

  // App specific
  copyTradingGrpcUrl: 'COPY_TRADING_GRPC_URL',
  copyTradingDatabaseUrl: 'COPY_TRADING_DATABASE_URL',
  accountsGrpcUrl: 'ACCOUNTS_GRPC_URL',
  ordersGrpcUrl: 'ORDERS_GRPC_URL',
} as const;

export const ENV_DEFAULTS = {
  ...SHARED_ENV_DEFAULTS,

  // App & service specific defaults
  copyTradingGrpcUrl: '0.0.0.0:50055',
  accountsGrpcUrl: '0.0.0.0:50052',
  ordersGrpcUrl: '0.0.0.0:50053',
  dbName: 'copy_trading_db',
  kafkaClientId: 'copy-trading-service',
} as const;
