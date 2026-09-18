import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { verifyMessage, Hex } from 'viem';
import { parseSiweMessage } from 'viem/siwe';
import { UserRole } from '@app/common/constants';
import { AuthResponse, ValidateTokenResponse } from '@app/contracts';
import { User } from '../database/schema/users.schema';
import { UsersService } from '../users';
import { AUTH_ERROR_CODES, AUTH_ERRORS, AUTH_LOGS } from './auth.constants';
import { GeneratedNonce, GeneratedTokens } from './auth.types';
import { NonceService } from './nonce.service';
import { TokenService } from './token.service';

/**
 * Service orchestrating Web3 authentication workflows:
 * - SIWE (Sign-In with Ethereum, EIP-4361) nonce generation and signature verification.
 * - Automatic user registration / lookup upon successful cryptographic verification.
 * - Token rotation and session termination (logout).
 * - Internal JWT access token validation for other microservices.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly nonceService: NonceService,
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Generates a single-use SIWE nonce with a 5-minute TTL for a given wallet address.
   *
   * @param walletAddress - Raw or checksummed EVM address (e.g. `0x5aaeb...`)
   */
  async getNonce(walletAddress: string): Promise<GeneratedNonce> {
    return this.nonceService.generateNonce(walletAddress);
  }

  /**
   * Verifies an EIP-4361 SIWE message and cryptographic signature.
   *
   * @remarks
   * Workflow:
   * 1. Parses and validates SIWE message structure and expiration time.
   * 2. Atomically consumes the nonce from Redis (`GETDEL`) to prevent replay attacks.
   * 3. Verifies the ECDSA signature against the wallet address via `viem`.
   * 4. Finds or registers the user in PostgreSQL (with EIP-55 checksum address).
   * 5. Issues a new Access JWT and Argon2-hashed Refresh Token pair.
   *
   * @param rawMessage - Full plaintext EIP-4361 formatted message
   * @param signature - 65-byte hex-encoded ECDSA signature string (`0x...`)
   * @throws {BadRequestException} If message structure or signature is malformed
   * @throws {UnauthorizedException} If nonce is expired/consumed or signature is invalid
   */
  async verifySiwe(rawMessage: string, signature: string): Promise<AuthResponse> {
    if (!rawMessage || !signature) {
      throw new BadRequestException({
        message: AUTH_ERRORS.siweCredentialsRequired,
        errorCode: AUTH_ERROR_CODES.siweCredentialsRequired,
      });
    }

    // 1. Parse SIWE message
    const parsed = parseSiweMessage(rawMessage);
    if (!parsed || !parsed.address || !parsed.nonce) {
      throw new BadRequestException({
        message: AUTH_ERRORS.malformedSiweMessage,
        errorCode: AUTH_ERROR_CODES.malformedSiweMessage,
      });
    }

    const walletAddress = this.usersService.normalizeAddress(parsed.address);

    // 2. Validate expiration time if specified in message
    const now = new Date();
    if (parsed.expirationTime && now > parsed.expirationTime) {
      throw new UnauthorizedException({
        message: AUTH_ERRORS.siweMessageExpired,
        errorCode: AUTH_ERROR_CODES.siweMessageExpired,
      });
    }

    // 3. Atomically validate & consume nonce (Replay protection)
    const isNonceValid = await this.nonceService.consumeNonce(walletAddress, parsed.nonce);
    if (!isNonceValid) {
      throw new UnauthorizedException({
        message: AUTH_ERRORS.invalidNonce,
        errorCode: AUTH_ERROR_CODES.invalidNonce,
      });
    }

    // 4. Cryptographic signature verification
    let isSignatureValid = false;
    try {
      isSignatureValid = await verifyMessage({
        address: walletAddress as Hex,
        message: rawMessage,
        signature: signature as Hex,
      });
    } catch {
      isSignatureValid = false;
    }

    if (!isSignatureValid) {
      this.logger.warn(AUTH_LOGS.signatureVerificationFailed(walletAddress));
      throw new UnauthorizedException({
        message: AUTH_ERRORS.invalidSignature,
        errorCode: AUTH_ERROR_CODES.invalidSignature,
      });
    }

    // 5. Find or register user
    const { user } = await this.usersService.findOrCreate(walletAddress);

    // 6. Generate JWT session tokens
    const tokens = await this.tokenService.generateTokens(user);

    return this.mapToAuthResponse(tokens, user);
  }

  /**
   * Rotates session tokens using an active Refresh Token.
   *
   * @param refreshToken - Raw opaque refresh token string (40 bytes hex)
   * @throws {UnauthorizedException} If the refresh token is expired, revoked, or compromised
   */
  async refreshTokens(refreshToken: string): Promise<AuthResponse> {
    const { tokens, user } = await this.tokenService.rotateTokens(refreshToken);
    return this.mapToAuthResponse(tokens, user);
  }

  /**
   * Revokes a user session upon logout.
   *
   * @param refreshToken - The refresh token of the session to terminate
   * @param userId - Optional UUIDv7 of the user to restrict query scope
   * @throws {BadRequestException} If refresh token is missing
   */
  async logout(refreshToken: string, userId?: string): Promise<boolean> {
    if (!refreshToken) {
      throw new BadRequestException({
        message: AUTH_ERRORS.refreshTokenRequired,
        errorCode: AUTH_ERROR_CODES.refreshTokenRequired,
      });
    }
    return this.tokenService.revokeToken(refreshToken, userId);
  }

  /**
   * Validates a JWT access token for internal East-West gRPC communication.
   *
   * @param token - Raw signed JWT string from Authorization header
   */
  async validateToken(token: string): Promise<ValidateTokenResponse> {
    try {
      const payload = await this.tokenService.verifyAccessToken(token);
      return {
        isValid: true,
        userId: payload.sub,
        walletAddress: payload.walletAddress,
        role: payload.role,
      };
    } catch {
      return {
        isValid: false,
        userId: '',
        walletAddress: '',
        role: '',
      };
    }
  }

  /**
   * Generates authentication tokens directly without cryptographic signature.
   * Strictly intended for developer sandbox and test environments.
   *
   * @param walletAddress - EVM wallet address to log in as (defaults to Hardhat #0)
   * @param role - Optional role to assign (e.g. TRADER or ADMIN)
   */
  async sandboxLogin(walletAddress?: string, role?: string): Promise<AuthResponse> {
    const DEFAULT_DEV_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    const address = this.usersService.normalizeAddress(walletAddress || DEFAULT_DEV_WALLET);

    let { user } = await this.usersService.findOrCreate(address);

    if (role && user.role !== (role as UserRole)) {
      user = await this.usersService.updateRole(user.id, role as UserRole);
    }

    const tokens = await this.tokenService.generateTokens(user);
    return this.mapToAuthResponse(tokens, user);
  }

  /**
   * Maps internal domain tokens and user entity to gRPC AuthResponse format.
   *
   * @param tokens - Generated JWT and Refresh token pair
   * @param user - User database entity
   * @returns Formatted AuthResponse object matching proto definition
   */
  private mapToAuthResponse(tokens: GeneratedTokens, user: User): AuthResponse {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        role: user.role,
        isActive: user.isActive,
        createdAt: Math.floor(user.createdAt.getTime() / 1000),
      },
    };
  }
}
