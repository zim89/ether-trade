import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { UserRole } from '@app/common/constants';
import { PROTO_SERVICES } from '@app/contracts';
import type { IdentityServiceClient } from '@app/contracts';
import {
  AuthResponseDto,
  GetNonceQueryDto,
  GetNonceResponseDto,
  LogoutResponseDto,
  UserProfileDto,
  VerifySiweDto,
} from './dto';

export interface AuthResult {
  dto: AuthResponseDto;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PROTO_SERVICES.identity)
    private readonly identityService: IdentityServiceClient,
  ) {}

  /**
   * Requests a cryptographic single-use nonce for wallet SIWE signing.
   */
  async getNonce(query: GetNonceQueryDto): Promise<GetNonceResponseDto> {
    const response = await firstValueFrom(
      this.identityService.getNonce({ walletAddress: query.walletAddress }),
    );

    return {
      nonce: response.nonce,
      expiresAt: response.expiresAt,
    };
  }

  /**
   * Verifies EIP-4361 signature, authenticates or registers the user, and issues tokens.
   */
  async verifySiwe(dto: VerifySiweDto): Promise<AuthResult> {
    const response = await firstValueFrom(
      this.identityService.verifySiwe({
        message: dto.message,
        signature: dto.signature,
      }),
    );

    if (!response.user) {
      throw new UnauthorizedException('Authentication succeeded but user profile was not returned');
    }

    return {
      dto: {
        accessToken: response.accessToken,
        expiresIn: response.expiresIn,
        user: {
          id: response.user.id,
          walletAddress: response.user.walletAddress,
          role: response.user.role as UserRole,
          isActive: response.user.isActive,
          createdAt: response.user.createdAt,
        },
      },
      refreshToken: response.refreshToken,
    };
  }

  /**
   * Rotates access and refresh tokens using the provided HttpOnly refresh token.
   */
  async refreshTokens(refreshToken?: string): Promise<AuthResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const response = await firstValueFrom(this.identityService.refreshTokens({ refreshToken }));

    if (!response.user) {
      throw new UnauthorizedException('Refresh succeeded but user profile was not returned');
    }

    return {
      dto: {
        accessToken: response.accessToken,
        expiresIn: response.expiresIn,
        user: {
          id: response.user.id,
          walletAddress: response.user.walletAddress,
          role: response.user.role as UserRole,
          isActive: response.user.isActive,
          createdAt: response.user.createdAt,
        },
      },
      refreshToken: response.refreshToken,
    };
  }

  /**
   * Revokes user refresh token session in Identity service.
   */
  async logout(refreshToken?: string, userId?: string): Promise<LogoutResponseDto> {
    if (!refreshToken && !userId) {
      return { success: true };
    }

    const response = await firstValueFrom(
      this.identityService.logout({
        refreshToken: refreshToken ?? '',
        userId: userId ?? '',
      }),
    );

    return {
      success: response.success,
    };
  }

  /**
   * Retrieves profile of currently authenticated user by ID.
   */
  async getMe(userId: string): Promise<UserProfileDto> {
    const response = await firstValueFrom(this.identityService.getUserById({ userId }));

    return {
      id: response.id,
      walletAddress: response.walletAddress,
      role: response.role as UserRole,
      isActive: response.isActive,
      createdAt: response.createdAt,
    };
  }
}
