import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { UserRole } from '@app/common/constants';
import {
  type CopyTradingServiceClient,
  PROTO_SERVICES,
  MasterTraderItem,
  CopySubscriptionItem,
} from '@app/contracts';
import type { CurrentUserData } from '../common/decorators';
import { CopyTradingController } from './copy-trading.controller';
import { CopyTradingService } from './copy-trading.service';

describe('CopyTradingController & CopyTradingService (API Gateway)', () => {
  let controller: CopyTradingController;

  const mockUser: CurrentUserData = {
    userId: 'follower-uuid-1',
    walletAddress: '0x1111111111111111111111111111111111111111',
    role: UserRole.TRADER,
  };

  const mockMasterUser: CurrentUserData = {
    userId: 'user-uuid-1',
    walletAddress: '0x2222222222222222222222222222222222222222',
    role: UserRole.TRADER,
  };

  const mockMasterItem: MasterTraderItem = {
    id: 'master-uuid-1',
    userId: 'user-uuid-1',
    displayName: 'Alice Crypto',
    bio: 'Scalper',
    totalPnl: '150.50000000',
    winRate: '68.50',
    totalCopiers: 5,
    minDeposit: '50.00000000',
    isActive: true,
  };

  const mockSubscriptionItem: CopySubscriptionItem = {
    id: 'sub-uuid-1',
    followerUserId: 'follower-uuid-1',
    masterId: 'master-uuid-1',
    allocatedBalance: '500.00000000',
    maxSlippagePercent: '1.00',
    status: 'ACTIVE',
    createdAt: 1729000000,
  };

  const mockGrpcClient: Partial<CopyTradingServiceClient> = {
    registerMaster: jest.fn().mockReturnValue(of({ master: mockMasterItem })),
    getMasterTraders: jest.fn().mockReturnValue(of({ items: [mockMasterItem], total: 1 })),
    createSubscription: jest.fn().mockReturnValue(of({ subscription: mockSubscriptionItem })),
    cancelSubscription: jest
      .fn()
      .mockReturnValue(of({ subscription: { ...mockSubscriptionItem, status: 'TERMINATED' } })),
    getSubscriptions: jest.fn().mockReturnValue(of({ items: [mockSubscriptionItem] })),
  };

  beforeEach(async () => {
    const module: TestingModule = await testModule();
    controller = module.get<CopyTradingController>(CopyTradingController);
  });

  async function testModule(): Promise<TestingModule> {
    return Test.createTestingModule({
      controllers: [CopyTradingController],
      providers: [
        CopyTradingService,
        {
          provide: PROTO_SERVICES.copyTrading,
          useValue: mockGrpcClient,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({ grpcDefaultDeadlineMs: 3000 }),
          },
        },
      ],
    }).compile();
  }

  describe('registerMaster', () => {
    it('should register a master trader via gRPC and return DTO', async () => {
      const result = await controller.registerMaster(mockMasterUser, {
        displayName: 'Alice Crypto',
        bio: 'Scalper',
        minDeposit: '50.00000000',
      });

      expect(mockGrpcClient.registerMaster).toHaveBeenCalled();
      expect(result.id).toBe('master-uuid-1');
      expect(result.displayName).toBe('Alice Crypto');
    });
  });

  describe('getMasterTraders', () => {
    it('should retrieve list of master traders', async () => {
      const result = await controller.getMasterTraders({ limit: 10, offset: 0 });

      expect(mockGrpcClient.getMasterTraders).toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe('master-uuid-1');
    });
  });

  describe('createSubscription', () => {
    it('should require idempotencyKey header', async () => {
      await expect(
        controller.createSubscription(
          mockUser,
          { masterId: 'master-uuid-1', allocatedBalance: '500.00000000' },
          undefined,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should forward subscription creation with idempotency key', async () => {
      const result = await controller.createSubscription(
        mockUser,
        { masterId: 'master-uuid-1', allocatedBalance: '500.00000000' },
        'idem-key-1',
      );

      expect(mockGrpcClient.createSubscription).toHaveBeenCalled();
      expect(result.id).toBe('sub-uuid-1');
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel active subscription', async () => {
      const result = await controller.cancelSubscription(mockUser, 'sub-uuid-1', {
        closePositions: false,
      });

      expect(mockGrpcClient.cancelSubscription).toHaveBeenCalled();
      expect(result.id).toBe('sub-uuid-1');
      expect(result.status).toBe('TERMINATED');
    });
  });

  describe('getSubscriptions', () => {
    it('should return list of user subscriptions', async () => {
      const result = await controller.getSubscriptions(mockUser);

      expect(mockGrpcClient.getSubscriptions).toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('sub-uuid-1');
    });
  });
});
