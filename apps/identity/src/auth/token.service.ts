import { randomBytes } from 'crypto';
import { Injectable, UnauthorizedException, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import { JwtPayload } from '@app/common/types';
import { AppConfig } from '../config';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import { refreshTokens } from '../database/schema/refresh-tokens.schema';
import { User } from '../database/schema/users.schema';
import { UsersService } from '../users/users.service';
import { AUTH_ERROR_CODES, AUTH_ERRORS, AUTH_LOGS } from './auth.constants';
import { GeneratedTokens } from './auth.types';

/**
 * Manages the authentication token lifecycle:
 * - Issues short-lived JWT access tokens (15m).
 * - Issues Argon2-hashed refresh tokens persisted to PostgreSQL (7d).
 * - Enforces Token Reuse Detection (revokes all user sessions on compromised token reuse).
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly ACCESS_TOKEN_EXPIRATION_SECONDS = 900; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRATION_DAYS = 7;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly usersService: UsersService,
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Issues a signed JWT access token and persists an Argon2-hashed refresh token.
   *
   * @param user - User entity used to populate JWT claims (`sub`, `walletAddress`, `role`)
   * @param metadata - Client session telemetry for audit trail (User-Agent and IP)
   */
  async generateTokens(
    user: User,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<GeneratedTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
    };

    const authConf = this.configService.getOrThrow(CONFIG_NAMESPACES.auth, { infer: true });

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.ACCESS_TOKEN_EXPIRATION_SECONDS,
      secret: authConf.jwtSecret,
    });

    const rawRefreshToken = randomBytes(40).toString('hex');
    const tokenHash = await argon2.hash(rawRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRATION_DAYS);

    await this.db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.ACCESS_TOKEN_EXPIRATION_SECONDS,
    };
  }

  /**
   * Rotates a refresh token and issues a fresh token pair.
   *
   * @remarks
   * Implements **Token Reuse Detection**: If an already revoked token is submitted,
   * it indicates token compromise. ALL active sessions for this user are revoked immediately.
   *
   * @param rawRefreshToken - Raw 40-byte hex refresh token string provided by client
   * @throws {UnauthorizedException} When the token is missing, invalid, expired, or compromised
   */
  async rotateTokens(rawRefreshToken: string): Promise<{ tokens: GeneratedTokens; user: User }> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException({
        message: AUTH_ERRORS.refreshTokenRequired,
        errorCode: AUTH_ERROR_CODES.refreshTokenRequired,
      });
    }

    // Query active and valid tokens
    const allUserTokens = await this.db.select().from(refreshTokens);

    let matchedTokenRecord: (typeof allUserTokens)[0] | null = null;
    for (const record of allUserTokens) {
      const isMatch = await argon2.verify(record.tokenHash, rawRefreshToken);
      if (isMatch) {
        matchedTokenRecord = record;
        break;
      }
    }

    if (!matchedTokenRecord) {
      throw new UnauthorizedException({
        message: AUTH_ERRORS.invalidRefreshToken,
        errorCode: AUTH_ERROR_CODES.invalidRefreshToken,
      });
    }

    // Reuse Detection: If token is already revoked, revoke ALL tokens for this user
    if (matchedTokenRecord.isRevoked) {
      this.logger.warn(AUTH_LOGS.revokedTokenReuseDetected(matchedTokenRecord.userId));
      await this.revokeAllUserTokens(matchedTokenRecord.userId);
      throw new UnauthorizedException({
        message: AUTH_ERRORS.tokenReuseDetected,
        errorCode: AUTH_ERROR_CODES.tokenReuseDetected,
      });
    }

    // Check expiration
    if (new Date() > matchedTokenRecord.expiresAt) {
      throw new UnauthorizedException({
        message: AUTH_ERRORS.refreshTokenExpired,
        errorCode: AUTH_ERROR_CODES.refreshTokenExpired,
      });
    }

    // Revoke old token
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.id, matchedTokenRecord.id));

    // Fetch user
    const user = await this.usersService.findById(matchedTokenRecord.userId);

    // Issue new pair
    const tokens = await this.generateTokens(user, {
      userAgent: matchedTokenRecord.userAgent || undefined,
      ipAddress: matchedTokenRecord.ipAddress || undefined,
    });

    return { tokens, user };
  }

  /**
   * Revokes a specific refresh token during single-session logout.
   *
   * @param rawRefreshToken - Raw 40-byte hex refresh token to revoke
   * @param userId - Optional user UUIDv7 to narrow down query search space
   * @returns `true` if the matching token was located and revoked, `false` otherwise
   */
  async revokeToken(rawRefreshToken: string, userId?: string): Promise<boolean> {
    const query = userId
      ? this.db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId))
      : this.db.select().from(refreshTokens);

    const tokens = await query;
    for (const record of tokens) {
      const isMatch = await argon2.verify(record.tokenHash, rawRefreshToken);
      if (isMatch) {
        await this.db
          .update(refreshTokens)
          .set({ isRevoked: true })
          .where(eq(refreshTokens.id, record.id));
        return true;
      }
    }
    return false;
  }

  /**
   * Revokes all active refresh tokens for a user (used during security breaches or full logout).
   *
   * @param userId - Unique user identifier (UUIDv7 string)
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.userId, userId));
  }

  /**
   * Verifies and decodes a signed JWT access token.
   *
   * @param token - Raw signed JWT string from Authorization header
   * @throws {UnauthorizedException} If the token signature is invalid or has expired
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      const authConf = this.configService.getOrThrow(CONFIG_NAMESPACES.auth, { infer: true });
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: authConf.jwtSecret,
      });
      return payload;
    } catch {
      throw new UnauthorizedException({
        message: AUTH_ERRORS.invalidAccessToken,
        errorCode: AUTH_ERROR_CODES.invalidAccessToken,
      });
    }
  }
}
