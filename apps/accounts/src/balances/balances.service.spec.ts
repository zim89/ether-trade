import { BadRequestException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Currency } from '@app/common/constants';
import type { Account } from '../database/schema/accounts.schema';
import { BalancesRepository } from './balances.repository';
import { BalancesService } from './balances.service';
import { BalanceMutationStatus } from './balances.types';

describe('BalancesService (Unit)', () => {
  let service: BalancesService;
  let repository: jest.Mocked<BalancesRepository>;

  const validUserId = '018f3a5e-1111-7000-8000-000000000001';
  const mockAccount: Account = {
    id: '018f3a5e-2222-7000-8000-000000000002',
    userId: validUserId,
    currency: Currency.USDT,
    availableBalance: '100.00000000',
    lockedBalance: '20.00000000',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    repository = {
      findOrCreate: jest.fn(),
      deposit: jest.fn(),
      lock: jest.fn(),
      unlock: jest.fn(),
      creditDeposit: jest.fn(),
      debitWithdrawal: jest.fn(),
    } as unknown as jest.Mocked<BalancesRepository>;

    service = new BalancesService(repository);
  });

  describe('Validation', () => {
    it('should throw BadRequestException for invalid UUID userId', async () => {
      await expect(
        service.getBalance({ userId: 'invalid-uuid', currency: 'USDT' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for unsupported currency', async () => {
      await expect(service.getBalance({ userId: validUserId, currency: 'DOGE' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid or negative amount', async () => {
      await expect(
        service.depositSandboxFunds({
          userId: validUserId,
          currency: Currency.USDT,
          amount: '-50.00',
          idempotencyKey: 'idemp-1',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.depositSandboxFunds({
          userId: validUserId,
          currency: Currency.USDT,
          amount: 'abc',
          idempotencyKey: 'idemp-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when idempotencyKey is missing', async () => {
      await expect(
        service.depositSandboxFunds({
          userId: validUserId,
          currency: Currency.USDT,
          amount: '10.00000000',
          idempotencyKey: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when sandbox deposit exceeds max limit', async () => {
      await expect(
        service.depositSandboxFunds({
          userId: validUserId,
          currency: Currency.USDT,
          amount: '2000000.00000000',
          idempotencyKey: 'idemp-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('calculateTotalBalance', () => {
    it('should accurately calculate total balance preserving exact scale', () => {
      const total = service.calculateTotalBalance('100.50000000', '25.25000000');
      expect(total).toBe('125.75000000');
    });
  });

  describe('getBalance', () => {
    it('should return account from repository', async () => {
      repository.findOrCreate.mockResolvedValueOnce(mockAccount);

      const result = await service.getBalance({ userId: validUserId, currency: Currency.USDT });
      expect(result).toEqual(mockAccount);
      expect(repository.findOrCreate.mock.calls[0]).toEqual([validUserId, Currency.USDT]);
    });

    it('should default to USDT when currency is empty string', async () => {
      repository.findOrCreate.mockResolvedValueOnce(mockAccount);

      const result = await service.getBalance({ userId: validUserId, currency: '' });
      expect(result).toEqual(mockAccount);
      expect(repository.findOrCreate.mock.calls[0]).toEqual([validUserId, Currency.USDT]);
    });
  });

  describe('depositSandboxFunds', () => {
    it('should successfully deposit funds when repository returns updated account', async () => {
      repository.deposit.mockResolvedValueOnce({
        account: mockAccount,
        status: BalanceMutationStatus.OK,
      });

      const result = await service.depositSandboxFunds({
        userId: validUserId,
        currency: Currency.USDT,
        amount: '100.00000000',
        idempotencyKey: 'idemp-1',
      });

      expect(result).toEqual(mockAccount);
      expect(repository.deposit.mock.calls[0]).toEqual([
        {
          userId: validUserId,
          currency: Currency.USDT,
          amount: '100',
          idempotencyKey: 'idemp-1',
        },
      ]);
    });
  });

  describe('lockBalance', () => {
    it('should successfully lock available funds', async () => {
      repository.lock.mockResolvedValueOnce({
        account: mockAccount,
        status: BalanceMutationStatus.OK,
      });

      const result = await service.lockBalance({
        userId: validUserId,
        currency: Currency.USDT,
        amount: '20.00000000',
        idempotencyKey: 'idemp-lock-1',
        referenceId: '',
      });

      expect(result).toEqual(mockAccount);
    });

    it('should throw RpcException when repository returns insufficient_available', async () => {
      repository.lock.mockResolvedValueOnce({
        status: BalanceMutationStatus.INSUFFICIENT_AVAILABLE,
        available: '5.00000000',
      });

      await expect(
        service.lockBalance({
          userId: validUserId,
          currency: Currency.USDT,
          amount: '2000.00000000',
          idempotencyKey: 'idemp-lock-1',
          referenceId: '',
        }),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('unlockBalance', () => {
    it('should successfully unlock locked funds', async () => {
      repository.unlock.mockResolvedValueOnce({
        account: mockAccount,
        status: BalanceMutationStatus.OK,
      });

      const result = await service.unlockBalance({
        userId: validUserId,
        currency: Currency.USDT,
        amount: '10.00000000',
        idempotencyKey: 'idemp-unlock-1',
        referenceId: '',
      });

      expect(result).toEqual(mockAccount);
    });
  });

  describe('creditDepositFunds & debitWithdrawalFunds', () => {
    it('should credit confirmed on-chain deposit funds', async () => {
      repository.creditDeposit.mockResolvedValueOnce({
        account: mockAccount,
        status: BalanceMutationStatus.OK,
      });

      const result = await service.creditDepositFunds({
        userId: validUserId,
        currency: Currency.USDT,
        amount: '50.00000000',
        idempotencyKey: 'idemp-dep-1',
        referenceId: '',
      });

      expect(result).toEqual(mockAccount);
    });

    it('should debit withdrawal funds', async () => {
      repository.debitWithdrawal.mockResolvedValueOnce({
        account: mockAccount,
        status: BalanceMutationStatus.OK,
      });

      const result = await service.debitWithdrawalFunds({
        userId: validUserId,
        currency: Currency.USDT,
        amount: '20.00000000',
        idempotencyKey: 'idemp-with-1',
        referenceId: '',
      });

      expect(result).toEqual(mockAccount);
    });
  });
});
