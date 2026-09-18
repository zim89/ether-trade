import { registerAs } from '@nestjs/config';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import { ENV_DEFAULTS, ENV_KEYS } from '../common/constants';

export const appConfig = registerAs(CONFIG_NAMESPACES.app, () => ({
  nodeEnv: process.env[ENV_KEYS.nodeEnv] ?? ENV_DEFAULTS.nodeEnv,
  grpcUrl: process.env[ENV_KEYS.identityGrpcUrl] ?? ENV_DEFAULTS.identityGrpcUrl,
}));
