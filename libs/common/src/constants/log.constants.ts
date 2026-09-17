/**
 * Standard logger context names across all microservices.
 */
export const LOGGER_CONTEXTS = {
  envValidation: 'EnvValidation',
  bootstrap: 'Bootstrap',
  accountsBootstrap: 'AccountsBootstrap',
  identityBootstrap: 'IdentityBootstrap',
  database: 'Database',
  auth: 'Auth',
  balances: 'Balances',
  redis: 'Redis',
} as const;

/**
 * Common diagnostic log messages grouped by feature/domain.
 */
export const COMMON_LOGS = {
  bootstrap: {
    grpcServiceRunning: (serviceName: string, url: string) =>
      `🚀 ${serviceName} gRPC Microservice is running on ${url}`,
  },
  env: {
    validationFailedHeader: (count: number) => `Validation failed with ${count} error(s):`,
    validationErrorItem: (property: string, constraints: string) =>
      ` - ${property}: ${constraints}`,
  },
  db: {
    closingConnectionPool: 'Closing database connection pool...',
  },
  redis: {
    connected: (host: string, port: number) =>
      `Connected to Redis/Valkey at ${host}:${port} via GLIDE`,
    connectionError: (message: string) => `Redis/Valkey connection error: ${message}`,
    closingConnection: 'Closing Redis/Valkey connection...',
  },
} as const;
