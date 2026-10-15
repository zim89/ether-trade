import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import { type AccountsServiceClient } from '@app/contracts';
import { SubscriptionStatus } from './common/constants';
import { CopyTradingService } from './copy-trading.service';
import { CopySubscriptionsRepository } from './database/copy-subscriptions.repository';
import { MasterTradersRepository } from './database/master-traders.repository';
import { RedisService } from './redis/redis.service';

describe('CopyTradingService (0 I/O Unit Tests)', () => {
  let service: CopyTradingService;
  let mockMasterRepo: any;
  let mockSubRepo: any;
  let mockRedisService: any;
  let mockAccountsClient: any;
  let mockGlideClient: any;

  beforeEach(() => {
    mockMasterRepo = {
      findAllActive: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      incrementCopiers: jest.fn().mockResolvedValue(undefined),
    };

    mockSubRepo = {
      findByFollowerAndMaster: jest.fn(),
      findActiveByFollower: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      reactivateSubscription: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
      findByFollower: jest.fn().mockResolvedValue([]),
    };

    mockGlideClient = {
      sadd: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };

    mockRedisService = {
      getClient: jest.fn().mockResolvedValue(mockGlideClient),
    };

    mockAccountsClient = {
      getBalance: jest.fn().mockReturnValue(
        of({
          balance: {
            availableBalance: '1000.00000000',
            lockedBalance: '0.00000000',
            totalBalance: '1000.00000000',
          },
        }),
      ),
    };

    service = new CopyTradingService(
      mockMasterRepo as MasterTradersRepository,
      mockSubRepo as CopySubscriptionsRepository,
      mockRedisService as RedisService,
      mockAccountsClient as AccountsServiceClient,
    );
  });

  describe('registerMaster', () => {
    it('should create master trader and synchronize fast-path map', async () => {
      mockMasterRepo.findByUserId.mockResolvedValue(null);
      mockMasterRepo.create.mockResolvedValue({
        id: 'master-uuid',
        userId: 'user-uuid',
        displayName: 'ProTrader',
        bio: 'Crypto trader',
        totalPnl: '0.00000000',
        winRate: '0.00',
        totalCopiers: 0,
        minDeposit: '50.00000000',
        isActive: true,
      });

      const res = await service.registerMaster({
        userId: 'user-uuid',
        displayName: 'ProTrader',
        bio: 'Crypto trader',
        minDeposit: '50.00000000',
      });

      expect(res.id).toBe('master-uuid');
      expect(service.getActiveMasterId('user-uuid')).toBe('master-uuid');
      expect(mockGlideClient.sadd).toHaveBeenCalled();
    });

    it('should return existing master if already registered and active', async () => {
      mockMasterRepo.findByUserId.mockResolvedValue({
        id: 'master-uuid',
        userId: 'user-uuid',
        displayName: 'ProTrader',
        totalPnl: '0.00000000',
        winRate: '0.00',
        totalCopiers: 1,
        minDeposit: '50.00000000',
        isActive: true,
      });

      const res = await service.registerMaster({
        userId: 'user-uuid',
        displayName: 'ProTrader',
      });

      expect(res.id).toBe('master-uuid');
      expect(mockMasterRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('createSubscription (Overcommit Guard & Lifecycle)', () => {
    const master = {
      id: 'master-1',
      userId: 'master-user-1',
      displayName: 'Alice',
      minDeposit: '50.00000000',
      isActive: true,
    };

    beforeEach(() => {
      mockMasterRepo.findById.mockResolvedValue(master);
    });

    it('should throw BadRequestException when allocated balance is less than minDeposit', async () => {
      await expect(
        service.createSubscription({
          followerUserId: 'bob-user',
          masterId: 'master-1',
          allocatedBalance: '40.00000000',
          idempotencyKey: 'key-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if an ACTIVE subscription already exists', async () => {
      mockSubRepo.findByFollowerAndMaster.mockResolvedValue({
        id: 'sub-1',
        status: SubscriptionStatus.ACTIVE,
      });

      await expect(
        service.createSubscription({
          followerUserId: 'bob-user',
          masterId: 'master-1',
          allocatedBalance: '100.00000000',
          idempotencyKey: 'key-1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if sum of allocations exceeds available balance (Overcommit Guard)', async () => {
      mockSubRepo.findByFollowerAndMaster.mockResolvedValue(null);
      // Already allocated 800 USDT across other subscriptions out of 1000 USDT available
      mockSubRepo.findActiveByFollower.mockResolvedValue([
        { id: 'sub-other', allocatedBalance: '800.00000000' },
      ]);

      // Requesting 300 USDT (800 + 300 = 1100 > 1000)
      await expect(
        service.createSubscription({
          followerUserId: 'bob-user',
          masterId: 'master-1',
          allocatedBalance: '300.00000000',
          idempotencyKey: 'key-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reactivate existing TERMINATED/PAUSED subscription instead of duplicate INSERT', async () => {
      mockSubRepo.findByFollowerAndMaster.mockResolvedValue({
        id: 'existing-sub-id',
        status: SubscriptionStatus.TERMINATED,
        allocatedBalance: '50.00000000',
      });
      mockSubRepo.findActiveByFollower.mockResolvedValue([]);
      mockSubRepo.reactivateSubscription.mockResolvedValue({
        id: 'existing-sub-id',
        followerUserId: 'bob-user',
        masterId: 'master-1',
        allocatedBalance: '100.00000000',
        maxSlippagePercent: '1.00',
        status: SubscriptionStatus.ACTIVE,
        createdAt: new Date(),
      });

      const res = await service.createSubscription({
        followerUserId: 'bob-user',
        masterId: 'master-1',
        allocatedBalance: '100.00000000',
        idempotencyKey: 'key-1',
      });

      expect(res.id).toBe('existing-sub-id');
      expect(mockSubRepo.reactivateSubscription).toHaveBeenCalledWith(
        'existing-sub-id',
        '100.00000000',
        '1.00',
      );
      expect(mockSubRepo.create).not.toHaveBeenCalled();
      expect(mockMasterRepo.incrementCopiers).toHaveBeenCalledWith('master-1', 1);
    });
  });

  describe('cancelSubscription', () => {
    it('should update status to TERMINATED and decrement totalCopiers', async () => {
      mockSubRepo.findById.mockResolvedValue({
        id: 'sub-1',
        followerUserId: 'bob-user',
        masterId: 'master-1',
        status: SubscriptionStatus.ACTIVE,
        createdAt: new Date(),
      });
      mockSubRepo.updateStatus.mockResolvedValue({
        id: 'sub-1',
        followerUserId: 'bob-user',
        masterId: 'master-1',
        status: SubscriptionStatus.TERMINATED,
        createdAt: new Date(),
      });

      const res = await service.cancelSubscription({
        subscriptionId: 'sub-1',
        followerUserId: 'bob-user',
      });

      expect(res.status).toBe(SubscriptionStatus.TERMINATED);
      expect(mockMasterRepo.incrementCopiers).toHaveBeenCalledWith('master-1', -1);
    });

    it('should throw NotFoundException if subscription does not exist or belongs to another user', async () => {
      mockSubRepo.findById.mockResolvedValue(null);

      await expect(
        service.cancelSubscription({
          subscriptionId: 'unknown-sub',
          followerUserId: 'bob-user',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
