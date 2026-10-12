import { defineConfig } from 'drizzle-kit';
import { ENV_DEFAULTS, ENV_KEYS } from './src/common/constants';

export default defineConfig({
  schema: './apps/orders/src/database/schema/index.ts',
  out: './apps/orders/src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env[ENV_KEYS.ordersDatabaseUrl] ||
      `postgres://${ENV_DEFAULTS.dbUser}:${ENV_DEFAULTS.dbPassword}@${ENV_DEFAULTS.dbHost}:${ENV_DEFAULTS.dbPort}/${ENV_DEFAULTS.dbName}`,
  },
});
