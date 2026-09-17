/**
 * Standard logger context names across all microservices.
 */
export const LOGGER_CONTEXTS = {
  envValidation: 'EnvValidation',
  bootstrap: 'Bootstrap',
  accountsBootstrap: 'AccountsBootstrap',
  identityBootstrap: 'IdentityBootstrap',
  apiGatewayBootstrap: 'ApiGatewayBootstrap',
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
    httpGatewayRunning: (url: string, swaggerUrl: string) =>
      `🚀 API Gateway is running on ${url} (Swagger docs: ${swaggerUrl})`,
  },
  env: {
    validationFailedHeader: (count: number) => `Validation failed with ${count} error(s):`,
    validationErrorItem: (property: string, constraints: string) =>
      ` - ${property}: ${constraints}`,
  },
  db: {
    closingConnectionPool: 'Closing database connection pool...',
    applyingMigrations: (serviceName: string, dbName: string) =>
      `[MIGRATE:${serviceName}] Applying migrations to ${dbName}...`,
    migrationsApplied: (serviceName: string) =>
      `[MIGRATE:${serviceName}] Migrations applied successfully!`,
    migrationFailed: (serviceName: string) => `[MIGRATE:${serviceName}] Migration failed:`,
  },
  redis: {
    connected: (host: string, port: number) =>
      `Connected to Redis/Valkey at ${host}:${port} via GLIDE`,
    connectionError: (message: string) => `Redis/Valkey connection error: ${message}`,
    closingConnection: 'Closing Redis/Valkey connection...',
  },
} as const;
