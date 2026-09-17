import { CookieOptions } from 'express';
import { NodeEnv } from '@app/common/constants';
import { GRPC_SERVICES_CONFIG } from '@app/contracts';

/**
 * Environment variable keys specific to API Gateway.
 */
export const ENV_KEYS = {
  port: 'PORT',
  nodeEnv: 'NODE_ENV',
  corsOrigin: 'CORS_ORIGIN',
  identityGrpcUrl: 'IDENTITY_GRPC_URL',
  accountsGrpcUrl: 'ACCOUNTS_GRPC_URL',
  cookieSecret: 'COOKIE_SECRET',
  jwtSecret: 'JWT_SECRET',
} as const;

/**
 * Default values for API Gateway environment variables.
 */
export const ENV_DEFAULTS = {
  port: 4000,
  nodeEnv: NodeEnv.DEVELOPMENT,
  corsOrigin: 'http://localhost:3000',
  identityGrpcUrl: GRPC_SERVICES_CONFIG.identity.defaultUrl,
  accountsGrpcUrl: GRPC_SERVICES_CONFIG.accounts.defaultUrl,
  cookieSecret: 'dev-cookie-secret-min-32-chars-long-local',
} as const;

/**
 * Global API Gateway routing constants.
 */
export const API_GATEWAY_CONSTANTS = {
  globalPrefix: 'api/v1',
} as const;

/**
 * Cookie configuration for secure session management.
 */
export const COOKIE_NAMES = {
  refreshToken: 'refreshToken',
} as const;

/**
 * Factory for refresh token cookie options.
 * Enforces HttpOnly, SameSite=Strict, and conditional Secure flag based on environment.
 */
export function getRefreshTokenCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: `/${API_GATEWAY_CONSTANTS.globalPrefix}/auth`,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  };
}
