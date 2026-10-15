import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TimeUnit } from '@valkey/valkey-glide';
import BigNumber from 'bignumber.js';
import { firstValueFrom } from 'rxjs';
import {
  type AccountsServiceClient,
  PROTO_SERVICES,
  MasterTraderItem,
  CopySubscriptionItem,
  RegisterMasterRequest,
  GetMasterTradersRequest,
  CreateSubscriptionRequest,
  CancelSubscriptionRequest,
  GetSubscriptionsRequest,
} from '@app/contracts';
import {
  COPY_TRADING_CONSTANTS,
  COPY_TRADING_ERRORS,
  COPY_TRADING_REDIS_KEYS,
  SubscriptionStatus,
} from './common/constants';
import { CopySubscriptionsRepository } from './database/copy-subscriptions.repository';
import { MasterTradersRepository } from './database/master-traders.repository';
import type { CopySubscription } from './database/schema/copy-subscriptions.schema';
import type { MasterTrader } from './database/schema/master-traders.schema';
import { RedisService } from './redis/redis.service';

@Injectable()
export class CopyTradingService implements OnModuleInit {
  private readonly logger = new Logger(CopyTradingService.name);

  /** Fast-path In-Memory cache for O(1) matching: userId -> masterId */
  private readonly activeMastersMap = new Map<string, string>();

  constructor(
    private readonly masterTradersRepository: MasterTradersRepository,
    private readonly copySubscriptionsRepository: CopySubscriptionsRepository,
    private readonly redisService: RedisService,
    @Inject(PROTO_SERVICES.accounts)
    private readonly accountsServiceClient: AccountsServiceClient,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.preloadActiveMasters();
  }

  /**
   * Preload active master traders to In-Memory Map and Valkey Set for fast-path check.
   */
  async preloadActiveMasters(): Promise<void> {
    try {
      const activeMasters = await this.masterTradersRepository.findAllActive();
      this.activeMastersMap.clear();

      for (const master of activeMasters) {
        this.activeMastersMap.set(master.userId, master.id);
      }

      const client = await this.redisService.getClient();
      if (activeMasters.length > 0) {
        const userIds = activeMasters.map((m) => m.userId);
        await client.sadd(COPY_TRADING_REDIS_KEYS.activeMastersSet, userIds);
      }

      this.logger.log(
        `Preloaded ${activeMasters.length} active masters into in-memory fast-path map`,
      );
    } catch (err: unknown) {
      this.logger.warn(`Could not preload active masters: ${(err as Error).message}`);
    }
  }

  /**
   * Check if a given userId is an active master trader (Fast-path O(1)).
   */
  getActiveMasterId(userId: string): string | undefined {
    return this.activeMastersMap.get(userId);
  }

  /**
   * Registers a new master trader.
   */
  async registerMaster(request: RegisterMasterRequest): Promise<MasterTraderItem> {
    const existing = await this.masterTradersRepository.findByUserId(request.userId);
    if (existing) {
      if (!existing.isActive) {
        throw new BadRequestException(COPY_TRADING_ERRORS.masterInactive(existing.id));
      }
      return this.mapMasterToItem(existing);
    }

    const created = await this.masterTradersRepository.create({
      userId: request.userId,
      displayName: request.displayName,
      bio: request.bio ?? null,
      minDeposit: request.minDeposit ?? '50.00000000',
      isActive: true,
    });

    // Synchronize fast-path in-memory map & Valkey set
    this.activeMastersMap.set(created.userId, created.id);
    try {
      const client = await this.redisService.getClient();
      await client.sadd(COPY_TRADING_REDIS_KEYS.activeMastersSet, [created.userId]);
    } catch (err: unknown) {
      this.logger.warn(`Failed to add master to Valkey set: ${(err as Error).message}`);
    }

    return this.mapMasterToItem(created);
  }

  /**
   * Lists master traders with pagination.
   */
  async getMasterTraders(
    request: GetMasterTradersRequest,
  ): Promise<{ items: MasterTraderItem[]; total: number }> {
    const result = await this.masterTradersRepository.findMany({
      isActiveOnly: true,
      limit: request.limit,
      offset: request.offset,
    });

    return {
      items: result.items.map((m) => this.mapMasterToItem(m)),
      total: result.total,
    };
  }

  /**
   * Creates or reactivates a subscription to a master trader.
   * Enforces:
   * 1. Min deposit check against master.minDeposit
   * 2. Overcommit guard: sum(existing active allocations) + requested <= availableBalance
   * 3. Resubscription lifecycle: if TERMINATED/PAUSED exists, reactivates it instead of duplicate insert
   * 4. Atomic increment of master.totalCopiers
   */
  async createSubscription(request: CreateSubscriptionRequest): Promise<CopySubscriptionItem> {
    const master = await this.masterTradersRepository.findById(request.masterId);
    if (!master || !master.isActive) {
      throw new NotFoundException(COPY_TRADING_ERRORS.masterNotFound(request.masterId));
    }

    const allocBn = new BigNumber(request.allocatedBalance);
    const minDepBn = new BigNumber(master.minDeposit);
    if (allocBn.isLessThan(minDepBn)) {
      throw new BadRequestException(COPY_TRADING_ERRORS.insufficientDeposit(master.minDeposit));
    }

    // Check existing subscription
    const existingSub = await this.copySubscriptionsRepository.findByFollowerAndMaster(
      request.followerUserId,
      request.masterId,
    );

    if (existingSub && existingSub.status === (SubscriptionStatus.ACTIVE as string)) {
      throw new ConflictException(COPY_TRADING_ERRORS.subscriptionAlreadyExists(request.masterId));
    }

    // Overcommit guard: fetch follower's available USDT balance
    const availableUsdt = await this.getMasterOrFollowerBalance(request.followerUserId, 'USDT');
    const activeSubs = await this.copySubscriptionsRepository.findActiveByFollower(
      request.followerUserId,
    );

    let currentAllocated = new BigNumber(0);
    for (const sub of activeSubs) {
      // If we are reactivating this subscription, ignore its old allocation
      if (existingSub && sub.id === existingSub.id) {
        continue;
      }
      currentAllocated = currentAllocated.plus(sub.allocatedBalance);
    }

    const totalRequested = currentAllocated.plus(allocBn);
    const availableBn = new BigNumber(availableUsdt);
    if (totalRequested.isGreaterThan(availableBn)) {
      throw new BadRequestException(
        COPY_TRADING_ERRORS.allocationExceedsBalance(request.allocatedBalance, availableUsdt),
      );
    }

    const maxSlippage =
      request.maxSlippagePercent ?? COPY_TRADING_CONSTANTS.maxSlippagePercentDefault;

    let subscription: CopySubscription;
    if (existingSub) {
      // Reactivate existing subscription
      subscription = await this.copySubscriptionsRepository.reactivateSubscription(
        existingSub.id,
        request.allocatedBalance,
        maxSlippage,
      );
    } else {
      // Create new subscription
      subscription = await this.copySubscriptionsRepository.create({
        followerUserId: request.followerUserId,
        masterId: request.masterId,
        allocatedBalance: request.allocatedBalance,
        maxSlippagePercent: maxSlippage,
        status: SubscriptionStatus.ACTIVE,
      });
    }

    // Increment master totalCopiers
    await this.masterTradersRepository.incrementCopiers(master.id, 1);

    return this.mapSubToItem(subscription);
  }

  /**
   * Cancels a subscription and decrements totalCopiers.
   */
  async cancelSubscription(request: CancelSubscriptionRequest): Promise<CopySubscriptionItem> {
    const sub = await this.copySubscriptionsRepository.findById(request.subscriptionId);
    if (!sub || sub.followerUserId !== request.followerUserId) {
      throw new NotFoundException(COPY_TRADING_ERRORS.subscriptionNotFound(request.subscriptionId));
    }

    if (sub.status !== (SubscriptionStatus.TERMINATED as string)) {
      const updated = await this.copySubscriptionsRepository.updateStatus(
        sub.id,
        SubscriptionStatus.TERMINATED,
      );
      await this.masterTradersRepository.incrementCopiers(sub.masterId, -1);
      return this.mapSubToItem(updated);
    }

    return this.mapSubToItem(sub);
  }

  /**
   * Retrieves all subscriptions for a follower.
   */
  async getSubscriptions(request: GetSubscriptionsRequest): Promise<CopySubscriptionItem[]> {
    const subs = await this.copySubscriptionsRepository.findByFollower(request.followerUserId);
    return subs.map((s) => this.mapSubToItem(s));
  }

  /**
   * Retrieves balance via accounts-service with short Valkey cache (TTL 5s).
   */
  async getMasterOrFollowerBalance(userId: string, currency = 'USDT'): Promise<string> {
    const cacheKey = COPY_TRADING_REDIS_KEYS.masterBalance(userId, currency);
    try {
      const client = await this.redisService.getClient();
      const cached = await client.get(cacheKey);
      if (typeof cached === 'string') {
        return cached;
      }
    } catch (err: unknown) {
      this.logger.warn(`Valkey cache read error for ${cacheKey}: ${(err as Error).message}`);
    }

    try {
      const response = await firstValueFrom(
        this.accountsServiceClient.getBalance({ userId, currency }),
      );

      const available = response.balance?.availableBalance ?? '0.00000000';

      try {
        const client = await this.redisService.getClient();
        await client.set(cacheKey, available, {
          expiry: {
            type: TimeUnit.Seconds,
            count: COPY_TRADING_CONSTANTS.masterBalanceCacheTtlSeconds,
          },
        });
      } catch (cacheErr: unknown) {
        this.logger.warn(`Valkey cache write error: ${(cacheErr as Error).message}`);
      }

      return available;
    } catch (err: unknown) {
      this.logger.error(`Failed to get balance from accounts-service: ${(err as Error).message}`);
      return '0.00000000';
    }
  }

  private mapMasterToItem(master: MasterTrader): MasterTraderItem {
    return {
      id: master.id,
      userId: master.userId,
      displayName: master.displayName,
      bio: master.bio ?? '',
      totalPnl: master.totalPnl,
      winRate: master.winRate,
      totalCopiers: master.totalCopiers,
      minDeposit: master.minDeposit,
      isActive: master.isActive,
    };
  }

  private mapSubToItem(sub: CopySubscription): CopySubscriptionItem {
    return {
      id: sub.id,
      followerUserId: sub.followerUserId,
      masterId: sub.masterId,
      allocatedBalance: sub.allocatedBalance,
      maxSlippagePercent: sub.maxSlippagePercent,
      status: sub.status,
      createdAt: Math.floor(new Date(sub.createdAt).getTime() / 1000),
    };
  }
}
