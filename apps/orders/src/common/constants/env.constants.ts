import { SHARED_ENV_DEFAULTS, SHARED_ENV_KEYS } from '@app/common/constants';
import { KAFKA_CLIENT_IDS } from '@app/common/kafka';
import { GRPC_SERVICES_CONFIG } from '@app/contracts';

export const ENV_KEYS = {
  ...SHARED_ENV_KEYS,

  // App specific
  ordersGrpcUrl: 'ORDERS_GRPC_URL',
  ordersDatabaseUrl: 'ORDERS_DATABASE_URL',
  accountsGrpcUrl: 'ACCOUNTS_GRPC_URL',
} as const;

export const ENV_DEFAULTS = {
  ...SHARED_ENV_DEFAULTS,

  // App & service specific defaults
  ordersGrpcUrl: GRPC_SERVICES_CONFIG.orders.defaultUrl,
  accountsGrpcUrl: GRPC_SERVICES_CONFIG.accounts.defaultUrl,
  dbName: 'orders_db',
  kafkaClientId: KAFKA_CLIENT_IDS.orders,
} as const;
