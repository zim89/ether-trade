import { SHARED_ENV_DEFAULTS, SHARED_ENV_KEYS } from '@app/common/constants';

export const ENV_KEYS = {
  ...SHARED_ENV_KEYS,

  // App specific
  accountsGrpcUrl: 'ACCOUNTS_GRPC_URL',
  accountsDatabaseUrl: 'ACCOUNTS_DATABASE_URL',
} as const;

export const ENV_DEFAULTS = {
  ...SHARED_ENV_DEFAULTS,

  // App & service specific defaults
  accountsGrpcUrl: '0.0.0.0:50052',
  dbName: 'accounts_db',
} as const;
