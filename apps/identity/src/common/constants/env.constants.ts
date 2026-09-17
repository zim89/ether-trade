import { SHARED_ENV_DEFAULTS, SHARED_ENV_KEYS } from '@app/common/constants';
import { GRPC_SERVICES_CONFIG } from '@app/contracts';

export const ENV_KEYS = {
  ...SHARED_ENV_KEYS,

  // App specific
  identityGrpcUrl: 'IDENTITY_GRPC_URL',
  identityDatabaseUrl: 'IDENTITY_DATABASE_URL',
} as const;

export const ENV_DEFAULTS = {
  ...SHARED_ENV_DEFAULTS,

  // App & service specific defaults
  identityGrpcUrl: GRPC_SERVICES_CONFIG.identity.defaultUrl,
  dbName: 'identity_db',
} as const;
