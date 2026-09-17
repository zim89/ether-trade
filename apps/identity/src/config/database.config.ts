import { registerAs } from '@nestjs/config';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import { ENV_DEFAULTS, ENV_KEYS } from '../common/constants';

export const databaseConfig = registerAs(CONFIG_NAMESPACES.database, () => ({
  url: process.env[ENV_KEYS.dbUrl],
  host: process.env[ENV_KEYS.dbHost] ?? ENV_DEFAULTS.dbHost,
  port: parseInt(process.env[ENV_KEYS.dbPort] ?? `${ENV_DEFAULTS.dbPort}`, 10),
  user: process.env[ENV_KEYS.dbUser] ?? ENV_DEFAULTS.dbUser,
  password: process.env[ENV_KEYS.dbPassword],
  name: process.env[ENV_KEYS.dbName] ?? ENV_DEFAULTS.dbName,
  maxConnections: parseInt(
    process.env[ENV_KEYS.dbMaxConnections] ?? `${ENV_DEFAULTS.dbMaxConnections}`,
    10,
  ),
}));
