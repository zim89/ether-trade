import { registerAs } from '@nestjs/config';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import { ENV_DEFAULTS, ENV_KEYS } from '../common/constants';

export const redisConfig = registerAs(CONFIG_NAMESPACES.redis, () => ({
  host: process.env[ENV_KEYS.redisHost] ?? ENV_DEFAULTS.redisHost,
  port: parseInt(process.env[ENV_KEYS.redisPort] ?? `${ENV_DEFAULTS.redisPort}`, 10),
  password: process.env[ENV_KEYS.redisPassword] || undefined,
}));
