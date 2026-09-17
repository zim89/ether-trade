/**
 * Result of a generated SIWE nonce.
 */
export interface GeneratedNonce {
  /** Cryptographically secure random nonce string */
  nonce: string;
  /** Unix timestamp (in seconds) when the nonce expires */
  expiresAt: number;
}

/**
 * Result of a token generation or rotation operation.
 */
export interface GeneratedTokens {
  /** Signed JWT access token for authenticating API requests */
  accessToken: string;
  /** Opaque random refresh token string */
  refreshToken: string;
  /** Access token expiration time in seconds */
  expiresIn: number;
}
