import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@app/common/constants';
import type { User } from '../database/schema/users.schema';
import { UsersService } from '../users';
import { AuthService } from './auth.service';
import { NonceService } from './nonce.service';
import { TokenService } from './token.service';

describe('AuthService (Unit)', () => {
  let service: AuthService;
  let nonceService: jest.Mocked<NonceService>;
  let tokenService: jest.Mocked<TokenService>;
  let usersService: jest.Mocked<UsersService>;

  const mockUser: User = {
    id: '018f3a5e-1111-7000-8000-000000000001',
    walletAddress: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    role: UserRole.TRADER,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    nonceService = {
      generateNonce: jest.fn(),
      consumeNonce: jest.fn(),
    } as unknown as jest.Mocked<NonceService>;

    tokenService = {
      generateTokens: jest.fn(),
      rotateTokens: jest.fn(),
      revokeToken: jest.fn(),
      verifyAccessToken: jest.fn(),
    } as unknown as jest.Mocked<TokenService>;

    usersService = {
      normalizeAddress: jest.fn((addr: string) => addr.toLowerCase()),
      findOrCreate: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    service = new AuthService(nonceService, tokenService, usersService);
  });

  describe('getNonce', () => {
    it('should delegate nonce generation to NonceService', async () => {
      const mockResult = {
        nonce: 'abc12345',
        expiresAt: Math.floor(Date.now() / 1000) + 300,
      };
      nonceService.generateNonce.mockResolvedValueOnce(mockResult);

      const result = await service.getNonce(mockUser.walletAddress);
      expect(result).toEqual(mockResult);
      expect(nonceService.generateNonce.mock.calls[0]).toEqual([mockUser.walletAddress]);
    });
  });

  describe('verifySiwe validation', () => {
    it('should throw BadRequestException if message or signature is missing', async () => {
      await expect(service.verifySiwe('', '0x123')).rejects.toThrow(BadRequestException);
      await expect(service.verifySiwe('some-msg', '')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if SIWE message is malformed', async () => {
      await expect(service.verifySiwe('invalid message format', '0x123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('refreshTokens', () => {
    it('should successfully rotate tokens', async () => {
      tokenService.rotateTokens.mockResolvedValueOnce({
        tokens: {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          expiresIn: 900,
        },
        user: mockUser,
      });

      const result = await service.refreshTokens('old-refresh');
      expect(result.accessToken).toBe('new-access');
      expect(result.refreshToken).toBe('new-refresh');
      expect(result.user?.id).toBe(mockUser.id);
    });
  });

  describe('logout', () => {
    it('should throw BadRequestException if refreshToken is empty', async () => {
      await expect(service.logout('')).rejects.toThrow(BadRequestException);
    });

    it('should revoke token successfully', async () => {
      tokenService.revokeToken.mockResolvedValueOnce(true);

      const result = await service.logout('active-token', mockUser.id);
      expect(result).toBe(true);
      expect(tokenService.revokeToken.mock.calls[0]).toEqual(['active-token', mockUser.id]);
    });
  });

  describe('validateToken', () => {
    it('should return valid payload for valid JWT', async () => {
      tokenService.verifyAccessToken.mockResolvedValueOnce({
        sub: mockUser.id,
        walletAddress: mockUser.walletAddress,
        role: mockUser.role,
      });

      const result = await service.validateToken('valid-token');
      expect(result.isValid).toBe(true);
      expect(result.userId).toBe(mockUser.id);
    });

    it('should return valid false when token verification fails', async () => {
      tokenService.verifyAccessToken.mockImplementationOnce(() => {
        throw new Error('invalid token');
      });

      const result = await service.validateToken('invalid-token');
      expect(result.isValid).toBe(false);
      expect(result.userId).toBe('');
    });
  });
});
