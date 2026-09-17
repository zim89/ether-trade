import { ENV_DEFAULTS, ENV_KEYS } from '../src/common/constants';

process.env[ENV_KEYS.nodeEnv] = 'test';
process.env[ENV_KEYS.identityGrpcUrl] = ENV_DEFAULTS.identityGrpcUrl;
process.env[ENV_KEYS.dbHost] = 'localhost';
process.env[ENV_KEYS.dbPort] = '5432';
process.env[ENV_KEYS.dbUser] = 'postgres';
process.env[ENV_KEYS.dbPassword] = 'postgres_test_password';
process.env[ENV_KEYS.dbName] = 'identity_test_db';
process.env[ENV_KEYS.dbMaxConnections] = '5';
process.env[ENV_KEYS.redisHost] = 'localhost';
process.env[ENV_KEYS.redisPort] = '6379';
process.env[ENV_KEYS.jwtSecret] = 'test-jwt-secret-key-min-32-chars-long';
process.env[ENV_KEYS.jwtExpiresIn] = '15m';
