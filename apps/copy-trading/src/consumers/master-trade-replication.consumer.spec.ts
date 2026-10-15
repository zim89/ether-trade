import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { KafkaProducerService } from '@app/common/kafka/kafka-producer.service';
import { TelemetryMetricsService } from '@app/common/telemetry';
import { type OrdersServiceClient } from '@app/contracts';
import { CopyRatioCalculator } from '../calculator/copy-ratio.calculator';
import { CopyOrderStatus, CopyOrderSkipReason } from '../common/constants';
import { CopyTradingService } from '../copy-trading.service';
import { CopyOrdersHistoryRepository } from '../database/copy-orders-history.repository';
import { CopySubscriptionsRepository } from '../database/copy-subscriptions.repository';
import { ProcessedEventsRepository } from '../database/processed-events.repository';
import type { CopySubscription } from '../database/schema/copy-subscriptions.schema';
import { DistributedLockService } from '../lock/distributed-lock.service';
import { RiskGuardService } from '../risk/risk-guard.service';
import { MasterTradeReplicationConsumer } from './master-trade-replication.consumer';

describe('MasterTradeReplicationConsumer (Unit Tests)', () => {
  let consumer: MasterTradeReplicationConsumer;
  let mockConfigService: any;
  let mockProducerService: any;
  let mockCopyTradingService: any;
  let mockSubRepo: any;
  let mockOrdersHistoryRepo: any;
  let mockProcessedEventsRepo: any;
  let mockCalculator: any;
  let mockRiskGuard: any;
  let mockLockService: any;
  let mockOrdersClient: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockReturnValue('dev'),
    };
    mockProducerService = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    mockCopyTradingService = {
      preloadActiveMasters: jest.fn().mockResolvedValue(undefined),
      getActiveMasterId: jest.fn(),
      getMasterOrFollowerBalance: jest.fn().mockResolvedValue('10000.00000000'),
    };
    mockSubRepo = {
      findActiveByMaster: jest.fn().mockResolvedValue([]),
      getSubscriptionPosition: jest.fn().mockResolvedValue({ buyQty: '0', sellQty: '0' }),
    };
    mockOrdersHistoryRepo = {
      create: jest.fn().mockResolvedValue({ id: 'history-1' }),
    };
    mockProcessedEventsRepo = {
      isProcessed: jest.fn().mockResolvedValue(false),
      markProcessed: jest.fn().mockResolvedValue({ id: 'event-1' }),
    };
    mockCalculator = {
      calculateBuyQuantity: jest.fn().mockReturnValue('0.05000000'),
      calculateSellQuantity: jest.fn().mockReturnValue('0.02500000'),
      calculateSubPosition: jest.fn().mockReturnValue('0.05000000'),
    };
    mockRiskGuard = {
      checkMinLot: jest.fn().mockReturnValue({ isDust: false, minLot: '0.00100000' }),
      calculateProtectedPrice: jest.fn().mockReturnValue('2525.00000000'),
    };
    mockLockService = {
      acquireLock: jest.fn().mockResolvedValue('lock-token-123'),
      releaseLock: jest.fn().mockResolvedValue(true),
    };
    mockOrdersClient = {
      createOrder: jest.fn().mockReturnValue(
        of({
          order: {
            orderId: 'follower-order-1',
          },
        }),
      ),
    };

    const mockTelemetryMetrics = {
      copyTradeEventsReceivedTotal: { add: jest.fn() },
      copyTradeExecutionLatencyMs: { record: jest.fn() },
      copyTradeSlippageBps: { record: jest.fn() },
    } as unknown as TelemetryMetricsService;

    consumer = new MasterTradeReplicationConsumer(
      mockConfigService as ConfigService,
      mockProducerService as KafkaProducerService,
      mockCopyTradingService as CopyTradingService,
      mockSubRepo as CopySubscriptionsRepository,
      mockOrdersHistoryRepo as CopyOrdersHistoryRepository,
      mockProcessedEventsRepo as ProcessedEventsRepository,
      mockCalculator as CopyRatioCalculator,
      mockRiskGuard as RiskGuardService,
      mockLockService as DistributedLockService,
      mockOrdersClient as OrdersServiceClient,
      mockTelemetryMetrics,
    );
  });

  describe('handleMessage - Fast-path & Deduplication', () => {
    it('should drop event instantly (0 I/O) if neither buyer nor seller is in active masters', async () => {
      mockCopyTradingService.getActiveMasterId.mockReturnValue(undefined);

      await consumer.handleMessage({
        topic: 'dev.matching.trade_executed',
        partition: 0,
        offset: '10',
        key: 'ETH_USDT',
        value: {
          eventId: 'event-uuid-1',
          eventType: 'trade.executed',
          payload: {
            tradeId: 'trade-uuid-1',
            buyerUserId: 'user-regular-1',
            sellerUserId: 'user-regular-2',
            symbol: 'ETH_USDT',
            price: '2500.00000000',
            quantity: '1.00000000',
          },
        },
        headers: {},
        heartbeat: jest.fn(),
      });

      expect(mockProcessedEventsRepo.isProcessed).not.toHaveBeenCalled();
      expect(mockSubRepo.findActiveByMaster).not.toHaveBeenCalled();
    });

    it('should skip event if already processed according to processed_events', async () => {
      mockCopyTradingService.getActiveMasterId.mockImplementation((userId: string) => {
        return userId === 'master-user-1' ? 'master-1' : undefined;
      });
      mockProcessedEventsRepo.isProcessed.mockResolvedValue(true);

      await consumer.handleMessage({
        topic: 'dev.matching.trade_executed',
        partition: 0,
        offset: '10',
        key: 'ETH_USDT',
        value: {
          eventId: 'duplicate-event-id',
          eventType: 'trade.executed',
          payload: {
            tradeId: 'trade-uuid-1',
            buyerUserId: 'master-user-1',
            sellerUserId: 'user-regular-2',
            symbol: 'ETH_USDT',
            price: '2500.00000000',
            quantity: '1.00000000',
          },
        },
        headers: {},
        heartbeat: jest.fn(),
      });

      expect(mockProcessedEventsRepo.isProcessed).toHaveBeenCalledWith('duplicate-event-id');
      expect(mockSubRepo.findActiveByMaster).not.toHaveBeenCalled();
      expect(mockProcessedEventsRepo.markProcessed).not.toHaveBeenCalled();
    });
  });

  describe('handleMessage - Replication Execution', () => {
    const subscriber: CopySubscription = {
      id: 'sub-1',
      followerUserId: 'follower-bob',
      masterId: 'master-1',
      allocatedBalance: '500.00000000',
      maxSlippagePercent: '1.00',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockCopyTradingService.getActiveMasterId.mockImplementation((userId: string) => {
        return userId === 'master-user-1' ? 'master-1' : undefined;
      });
      mockProcessedEventsRepo.isProcessed.mockResolvedValue(false);
      mockSubRepo.findActiveByMaster.mockResolvedValue([subscriber]);
    });

    it('should successfully replicate BUY trade for active subscribers and mark processed', async () => {
      const heartbeat = jest.fn().mockResolvedValue(undefined);

      await consumer.handleMessage({
        topic: 'dev.matching.trade_executed',
        partition: 0,
        offset: '10',
        key: 'ETH_USDT',
        value: {
          eventId: 'event-uuid-1',
          eventType: 'trade.executed',
          payload: {
            tradeId: 'trade-uuid-1',
            buyerUserId: 'master-user-1',
            sellerUserId: 'regular-user-2',
            symbol: 'ETH_USDT',
            price: '2500.00000000',
            quantity: '1.00000000',
          },
        },
        headers: {},
        heartbeat,
      });

      expect(mockLockService.acquireLock).toHaveBeenCalledWith(
        'lock:copy:follower:follower-bob',
        10000,
      );
      expect(mockCalculator.calculateBuyQuantity).toHaveBeenCalled();
      expect(mockRiskGuard.checkMinLot).toHaveBeenCalledWith('ETH_USDT', '0.05000000');
      expect(mockRiskGuard.calculateProtectedPrice).toHaveBeenCalledWith({
        masterPrice: '2500.00000000',
        maxSlippagePercent: '1.00',
        side: 'BUY',
      });
      expect(mockOrdersClient.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'follower-bob',
          pair: 'ETH_USDT',
          side: 'BUY',
          price: '2525.00000000',
          amount: '0.05000000',
          idempotencyKey: 'copy:trade-uuid-1:follower-bob',
        }),
      );
      expect(mockOrdersHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: 'sub-1',
          masterTradeId: 'trade-uuid-1',
          followerOrderId: 'follower-order-1',
          status: CopyOrderStatus.COMPLETED,
        }),
      );
      expect(mockLockService.releaseLock).toHaveBeenCalledWith(
        'lock:copy:follower:follower-bob',
        'lock-token-123',
      );
      expect(mockProcessedEventsRepo.markProcessed).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'event-uuid-1' }),
      );
    });

    it('should mark history as SKIPPED when order quantity is dust (< minLot)', async () => {
      mockRiskGuard.checkMinLot.mockReturnValue({ isDust: true, minLot: '0.00100000' });

      await consumer.handleMessage({
        topic: 'dev.matching.trade_executed',
        partition: 0,
        offset: '10',
        key: 'ETH_USDT',
        value: {
          eventId: 'event-uuid-2',
          eventType: 'trade.executed',
          payload: {
            tradeId: 'trade-uuid-2',
            buyerUserId: 'master-user-1',
            sellerUserId: 'regular-user-2',
            symbol: 'ETH_USDT',
            price: '2500.00000000',
            quantity: '0.00001000',
          },
        },
        headers: {},
        heartbeat: jest.fn(),
      });

      expect(mockOrdersClient.createOrder).not.toHaveBeenCalled();
      expect(mockOrdersHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: 'sub-1',
          masterTradeId: 'trade-uuid-2',
          status: CopyOrderStatus.SKIPPED,
          failureReason: CopyOrderSkipReason.BELOW_MIN_LOT,
        }),
      );
      expect(mockLockService.releaseLock).toHaveBeenCalled();
    });

    it('should isolate order creation failure and record FAILED in history without crashing', async () => {
      mockOrdersClient.createOrder.mockReturnValue(
        throwError(() => new Error('INSUFFICIENT_FUNDS')),
      );

      await consumer.handleMessage({
        topic: 'dev.matching.trade_executed',
        partition: 0,
        offset: '10',
        key: 'ETH_USDT',
        value: {
          eventId: 'event-uuid-3',
          eventType: 'trade.executed',
          payload: {
            tradeId: 'trade-uuid-3',
            buyerUserId: 'master-user-1',
            sellerUserId: 'regular-user-2',
            symbol: 'ETH_USDT',
            price: '2500.00000000',
            quantity: '1.00000000',
          },
        },
        headers: {},
        heartbeat: jest.fn(),
      });

      expect(mockOrdersHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: 'sub-1',
          masterTradeId: 'trade-uuid-3',
          status: CopyOrderStatus.FAILED,
          failureReason: 'INSUFFICIENT_FUNDS',
        }),
      );
      expect(mockLockService.releaseLock).toHaveBeenCalled();
    });

    it('should support Master-to-Master trade replication for both buyer and seller independently', async () => {
      mockCopyTradingService.getActiveMasterId.mockImplementation((userId: string) => {
        if (userId === 'master-buyer') return 'master-id-1';
        if (userId === 'master-seller') return 'master-id-2';
        return undefined;
      });

      await consumer.handleMessage({
        topic: 'dev.matching.trade_executed',
        partition: 0,
        offset: '10',
        key: 'ETH_USDT',
        value: {
          eventId: 'event-m2m-1',
          eventType: 'trade.executed',
          payload: {
            tradeId: 'trade-m2m-1',
            buyerUserId: 'master-buyer',
            sellerUserId: 'master-seller',
            symbol: 'ETH_USDT',
            price: '2500.00000000',
            quantity: '1.00000000',
          },
        },
        headers: {},
        heartbeat: jest.fn(),
      });

      // Both masters fetched subscribers
      expect(mockSubRepo.findActiveByMaster).toHaveBeenCalledWith('master-id-1');
      expect(mockSubRepo.findActiveByMaster).toHaveBeenCalledWith('master-id-2');
    });
  });
});
