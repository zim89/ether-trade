import { SHARED_ENV_DEFAULTS, SHARED_ENV_KEYS } from '@app/common/constants';
import { GRPC_SERVICES_CONFIG } from '@app/contracts';

export const ENV_KEYS = {
  ...SHARED_ENV_KEYS,

  // App specific
  accountsGrpcUrl: 'ACCOUNTS_GRPC_URL',
  accountsDatabaseUrl: 'ACCOUNTS_DATABASE_URL',
} as const;

export const ENV_DEFAULTS = {
  ...SHARED_ENV_DEFAULTS,

  // App & service specific defaults
  accountsGrpcUrl: GRPC_SERVICES_CONFIG.accounts.defaultUrl,
  dbName: 'accounts_db',
} as const;
