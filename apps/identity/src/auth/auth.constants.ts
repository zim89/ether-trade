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
