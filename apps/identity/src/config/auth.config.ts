import { registerAs } from '@nestjs/config';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import { ENV_DEFAULTS, ENV_KEYS } from '../common/constants';

export const authConfig = registerAs(CONFIG_NAMESPACES.auth, () => ({
  jwtSecret: process.env[ENV_KEYS.jwtSecret],
  jwtExpiresIn: process.env[ENV_KEYS.jwtExpiresIn] ?? ENV_DEFAULTS.jwtExpiresIn,
}));
