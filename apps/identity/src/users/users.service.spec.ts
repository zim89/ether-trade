import { BadRequestException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService (Domain & Normalization)', () => {
  let service: UsersService;
  let mockUsersRepo: jest.Mocked<Partial<UsersRepository>>;

  beforeEach(() => {
    mockUsersRepo = {
      findById: jest.fn(),
      findByWalletAddress: jest.fn(),
      findOrCreateByWalletAddress: jest.fn(),
      updateRole: jest.fn(),
    };
    service = new UsersService(mockUsersRepo as UsersRepository);
  });

  describe('normalizeAddress (EIP-55)', () => {
    it('should normalize valid lowercase EVM address to correct EIP-55 checksum', () => {
      const lowercase = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
      const normalized = service.normalizeAddress(lowercase);
      expect(normalized).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    });

    it('should throw BadRequestException on malformed hex address', () => {
      expect(() => service.normalizeAddress('invalid-address')).toThrow(BadRequestException);
      expect(() => service.normalizeAddress('0x123')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException on empty string or nullish input', () => {
      expect(() => service.normalizeAddress('')).toThrow(BadRequestException);
    });
  });
});
