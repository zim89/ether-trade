/**
 * Standard runtime environment identifier.
 */
export enum NodeEnv {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TEST = 'test',
}

/**
 * Standard configuration namespace keys across all microservices.
 */
export const CONFIG_NAMESPACES = {
  app: 'app',
  database: 'database',
  redis: 'redis',
  auth: 'auth',
  kafka: 'kafka',
} as const;

/**
 * Universal environment variable keys shared across all monorepo microservices.
 */
export const SHARED_ENV_KEYS = {
  // App
  nodeEnv: 'NODE_ENV',

  // Auth / JWT
  jwtSecret: 'JWT_SECRET',
  jwtExpiresIn: 'JWT_EXPIRES_IN',

  // Database
  dbUrl: 'DATABASE_URL',
  dbHost: 'DB_HOST',
  dbPort: 'DB_PORT',
  dbUser: 'DB_USER',
  dbPassword: 'DB_PASSWORD',
  dbName: 'DB_NAME',
  dbMaxConnections: 'DB_MAX_CONNECTIONS',

  // Redis / Valkey
  redisHost: 'REDIS_HOST',
  redisPort: 'REDIS_PORT',
  redisPassword: 'REDIS_PASSWORD',

  // Kafka
  kafkaBrokers: 'KAFKA_BROKERS',
} as const;

/**
 * Universal default values for shared environment variables.
 */
export const SHARED_ENV_DEFAULTS = {
  nodeEnv: NodeEnv.DEVELOPMENT,
  jwtExpiresIn: '15m',
  dbHost: 'localhost',
  dbPort: 5432,
  dbUser: 'postgres',
  dbPassword: 'postgres',
  dbMaxConnections: 10,
  redisHost: 'localhost',
  redisPort: 6379,
} as const;

/**
 * Default cascade order for loading environment files in development.
 */
export const DEFAULT_ENV_FILES = ['.env.development.local', '.env.development', '.env'] as const;
