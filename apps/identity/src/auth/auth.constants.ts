/**
 * Canonical machine-readable error codes for the authentication module.
 */
export const AUTH_ERROR_CODES = {
  refreshTokenRequired: 'REFRESH_TOKEN_REQUIRED',
  invalidRefreshToken: 'INVALID_REFRESH_TOKEN',
  refreshTokenExpired: 'REFRESH_TOKEN_EXPIRED',
  tokenReuseDetected: 'TOKEN_REUSE_DETECTED',
  invalidAccessToken: 'INVALID_ACCESS_TOKEN',
  siweCredentialsRequired: 'SIWE_CREDENTIALS_REQUIRED',
  malformedSiweMessage: 'MALFORMED_SIWE_MESSAGE',
  siweMessageExpired: 'SIWE_MESSAGE_EXPIRED',
  invalidNonce: 'INVALID_NONCE',
  invalidSignature: 'INVALID_SIGNATURE',
} as const;

/**
 * Canonical error messages used across the authentication module.
 */
export const AUTH_ERRORS = {
  // Refresh & Access Tokens
  refreshTokenRequired: 'Refresh token is required',
  invalidRefreshToken: 'Invalid refresh token',
  refreshTokenExpired: 'Refresh token expired',
  tokenReuseDetected: 'Compromised refresh token reused. All sessions revoked.',
  invalidAccessToken: 'Invalid or expired access token',

  // SIWE (Sign-In with Ethereum)
  siweCredentialsRequired: 'SIWE message and signature are required',
  malformedSiweMessage: 'Malformed SIWE message',
  siweMessageExpired: 'SIWE message has expired',
  invalidNonce: 'Invalid, expired or already used SIWE nonce',
  invalidSignature: 'Invalid cryptographic signature',
} as const;

/**
 * Diagnostic log messages for the authentication module.
 */
export const AUTH_LOGS = {
  nonceExpired: (address: string) => `Nonce expired or not found for address: ${address}`,
  nonceMismatch: (address: string, expected: string, received: string) =>
    `Nonce mismatch for address ${address}. Expected: ${expected}, Received: ${received}`,
  signatureVerificationFailed: (address: string) =>
    `Signature verification failed for address ${address}`,
  revokedTokenReuseDetected: (userId: string) =>
    `Revoked refresh token reuse detected for user ${userId}! Revoking all sessions.`,
} as const;
