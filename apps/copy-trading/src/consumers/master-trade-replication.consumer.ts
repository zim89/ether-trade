import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SHARED_ENV_DEFAULTS, SHARED_ENV_KEYS } from '@app/common/constants';
import { BaseKafkaConsumer } from '@app/common/kafka/kafka-consumer.abstract';
import { KafkaProducerService } from '@app/common/kafka/kafka-producer.service';
import {
  getKafkaTopicName,
  KAFKA_CONSUMER_GROUPS,
  KAFKA_DOMAINS,
  KAFKA_HEADERS,
} from '@app/common/kafka/kafka.constants';
import { KafkaBatchConsumerPayload } from '@app/common/kafka/kafka.types';
import { TelemetryMetricsService } from '@app/common/telemetry';
import { executeInBatches } from '@app/common/utils';
import {
  type DomainEventEnvelope,
  type OrdersServiceClient,
  type TradeExecutedEvent,
  MATCHING_ACTIONS,
  OrderSide,
  OrderType,
  PROTO_SERVICES,
} from '@app/contracts';
import { CopyRatioCalculator } from '../calculator/copy-ratio.calculator';
import {
  COPY_TRADING_CONSTANTS,
  COPY_TRADING_REDIS_KEYS,
  CopyOrderStatus,
  CopyOrderSkipReason,
} from '../common/constants';
import { CopyTradingService } from '../copy-trading.service';
import { CopyOrdersHistoryRepository } from '../database/copy-orders-history.repository';
import { CopySubscriptionsRepository } from '../database/copy-subscriptions.repository';
import { ProcessedEventsRepository } from '../database/processed-events.repository';
import type { CopySubscription } from '../database/schema/copy-subscriptions.schema';
import { DistributedLockService } from '../lock/distributed-lock.service';
import { RiskGuardService } from '../risk/risk-guard.service';

interface ReplicationSideTask {
  masterId: string;
  masterUserId: string;
  side: 'BUY' | 'SELL';
  masterPrice: string;
  masterQuantity: string;
  pair: string;
  tradeId: string;
}

@Injectable()
export class MasterTradeReplicationConsumer extends BaseKafkaConsumer implements OnModuleInit {
  protected override readonly logger = new Logger(MasterTradeReplicationConsumer.name);

  constructor(
    configService: ConfigService,
    producerService: KafkaProducerService,
    private readonly copyTradingService: CopyTradingService,
    private readonly copySubscriptionsRepository: CopySubscriptionsRepository,
    private readonly copyOrdersHistoryRepository: CopyOrdersHistoryRepository,
    private readonly processedEventsRepository: ProcessedEventsRepository,
    private readonly copyRatioCalculator: CopyRatioCalculator,
    private readonly riskGuardService: RiskGuardService,
    private readonly distributedLockService: DistributedLockService,
    @Inject(PROTO_SERVICES.orders)
    private readonly ordersServiceClient: OrdersServiceClient,
    private readonly telemetryMetrics: TelemetryMetricsService,
  ) {
    const appEnv = (
      configService.get<string>(SHARED_ENV_KEYS.appEnv) || SHARED_ENV_DEFAULTS.appEnv
    ).toLowerCase();
    const tradeTopic = getKafkaTopicName(appEnv, KAFKA_DOMAINS.matching);

    super(configService, producerService, {
      groupId: KAFKA_CONSUMER_GROUPS.copyTradingReplication,
      topics: [tradeTopic],
      fromBeginning: false,
    });
  }

  override async onModuleInit(): Promise<void> {
    await this.copyTradingService.preloadActiveMasters();
    await super.onModuleInit();
  }

  /**
   * Processes a single TradeExecuted message via the Fast-path Guard & Idempotency Pipeline.
   */
  async handleMessage(payload: KafkaBatchConsumerPayload): Promise<void> {
    const envelope = payload.value as DomainEventEnvelope<TradeExecutedEvent>;

    if (!envelope || !envelope.payload || !envelope.eventId) {
      throw new Error(
        `INVALID_EVENT_SCHEMA: Missing envelope or payload at offset ${payload.offset}`,
      );
    }

    const action = envelope.action || payload.headers[KAFKA_HEADERS.action];
    if (action && action !== MATCHING_ACTIONS.tradeExecuted) {
      this.logger.debug(`Ignoring non-matching action in replication consumer: ${action}`);
      return;
    }

    const trade = envelope.payload;

    // Step 0: Fast-path In-Memory Guard (activeMastersMap) O(1) Check
    const buyerMasterId = this.copyTradingService.getActiveMasterId(trade.buyerUserId);
    const sellerMasterId = this.copyTradingService.getActiveMasterId(trade.sellerUserId);

    if (!buyerMasterId && !sellerMasterId) {
      // Instant drop without any DB I/O
      return;
    }

    this.telemetryMetrics.copyTradeEventsReceivedTotal?.add(1, {
      pair: trade.symbol,
    });

    // Deduplication check via processed_events table
    const alreadyProcessed = await this.processedEventsRepository.isProcessed(envelope.eventId);
    if (alreadyProcessed) {
      this.logger.warn(
        `Duplicate trade event skipped: eventId=${envelope.eventId}, tradeId=${trade.tradeId}`,
      );
      return;
    }

    // Step 1: Independent side handling (Master-to-Master Trade Support)
    const sideTasks: ReplicationSideTask[] = [];

    if (buyerMasterId) {
      sideTasks.push({
        masterId: buyerMasterId,
        masterUserId: trade.buyerUserId,
        side: 'BUY',
        masterPrice: trade.price,
        masterQuantity: trade.quantity,
        pair: trade.symbol,
        tradeId: trade.tradeId,
      });
    }

    if (sellerMasterId) {
      sideTasks.push({
        masterId: sellerMasterId,
        masterUserId: trade.sellerUserId,
        side: 'SELL',
        masterPrice: trade.price,
        masterQuantity: trade.quantity,
        pair: trade.symbol,
        tradeId: trade.tradeId,
      });
    }

    for (const task of sideTasks) {
      await this.replicateMasterTrade(task, payload);
    }

    // Step 5: Mark event as processed in DB
    await this.processedEventsRepository.markProcessed({
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      consumerGroup: KAFKA_CONSUMER_GROUPS.copyTradingReplication,
    });
  }

  /**
   * Replicates one side of a master trade to all active subscribers.
   */
  private async replicateMasterTrade(
    task: ReplicationSideTask,
    payload: KafkaBatchConsumerPayload,
  ): Promise<void> {
    const subscribers = await this.copySubscriptionsRepository.findActiveByMaster(task.masterId);
    if (!subscribers.length) {
      return;
    }

    // Fetch master relevant balance (with 5s Valkey cache)
    const [baseCurrency] = task.pair.split('_');
    const masterBalanceCurrency = task.side === 'BUY' ? 'USDT' : baseCurrency;
    const masterBalance = await this.copyTradingService.getMasterOrFollowerBalance(
      task.masterUserId,
      masterBalanceCurrency,
    );

    // Discrete batching: chunkArray with batch size from constants and heartbeat between batches
    await executeInBatches(
      subscribers,
      COPY_TRADING_CONSTANTS.followerBatchConcurrency,
      (subscriber) => this.replicateForSubscriber(subscriber, task, masterBalance),
      () => payload.heartbeat(),
    );
  }

  /**
   * Replicates order for an individual subscriber with Redlock, CopyRatio calculation and failure isolation.
   */
  private async replicateForSubscriber(
    subscriber: CopySubscription,
    task: ReplicationSideTask,
    masterBalance: string,
  ): Promise<void> {
    const lockKey = COPY_TRADING_REDIS_KEYS.followerLock(subscriber.followerUserId);
    const lockToken = await this.distributedLockService.acquireLock(
      lockKey,
      COPY_TRADING_CONSTANTS.defaultLockTtlMs,
    );

    if (!lockToken) {
      this.logger.warn(
        `Could not acquire lock for follower ${subscriber.followerUserId}, skipping trade ${task.tradeId}`,
      );
      return;
    }

    try {
      // 1. Calculate order quantity
      let targetQuantity = '0.00000000';
      if (task.side === 'BUY') {
        targetQuantity = this.copyRatioCalculator.calculateBuyQuantity({
          masterOrderQuantity: task.masterQuantity,
          masterAvailableUsdt: masterBalance,
          followerAllocatedUsdt: subscriber.allocatedBalance,
        });
      } else {
        const subPos = await this.copySubscriptionsRepository.getSubscriptionPosition(
          subscriber.id,
          task.pair,
        );
        const netPosition = this.copyRatioCalculator.calculateSubPosition(
          subPos.buyQty,
          subPos.sellQty,
        );

        targetQuantity = this.copyRatioCalculator.calculateSellQuantity({
          masterSellQuantity: task.masterQuantity,
          masterTotalBaseAsset: masterBalance,
          followerSubPosition: netPosition,
        });
      }

      // 2. RiskGuard: Dust check
      const minLotCheck = this.riskGuardService.checkMinLot(task.pair, targetQuantity);
      if (minLotCheck.isDust) {
        await this.copyOrdersHistoryRepository.create({
          subscriptionId: subscriber.id,
          masterTradeId: task.tradeId,
          followerOrderId: null,
          pair: task.pair,
          masterSide: task.side,
          replicatedQuantity: targetQuantity,
          replicatedPrice: task.masterPrice,
          status: CopyOrderStatus.SKIPPED,
          failureReason: CopyOrderSkipReason.BELOW_MIN_LOT,
        });
        return;
      }

      // 3. RiskGuard: Protective price with maxSlippagePercent
      const protectedPrice = this.riskGuardService.calculateProtectedPrice({
        masterPrice: task.masterPrice,
        maxSlippagePercent: subscriber.maxSlippagePercent,
        side: task.side,
      });

      // 4. Deterministic idempotency key: copy:${masterTradeId}:${followerUserId}
      const idempotencyKey = `copy:${task.tradeId}:${subscriber.followerUserId}`;

      // 5. Place order on exchange via OrdersService.CreateOrder
      const executionStart = process.hrtime.bigint();
      try {
        const orderResponse = await firstValueFrom(
          this.ordersServiceClient.createOrder({
            userId: subscriber.followerUserId,
            pair: task.pair,
            side: task.side === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
            type: OrderType.LIMIT,
            price: protectedPrice,
            amount: targetQuantity,
            idempotencyKey,
          }),
        );

        const executionDurationMs = Number(process.hrtime.bigint() - executionStart) / 1_000_000;
        this.telemetryMetrics.copyTradeExecutionLatencyMs?.record(executionDurationMs, {
          pair: task.pair,
          side: task.side,
        });

        // Compute slippage in basis points: abs((protectedPrice - masterPrice) / masterPrice) * 10000
        const mPrice = Number(task.masterPrice);
        const pPrice = Number(protectedPrice);
        if (mPrice > 0) {
          const slippageBps = Math.abs((pPrice - mPrice) / mPrice) * 10000;
          this.telemetryMetrics.copyTradeSlippageBps?.record(slippageBps, {
            pair: task.pair,
            side: task.side,
          });
        }

        const followerOrderId = orderResponse.order?.orderId ?? null;

        await this.copyOrdersHistoryRepository.create({
          subscriptionId: subscriber.id,
          masterTradeId: task.tradeId,
          followerOrderId,
          pair: task.pair,
          masterSide: task.side,
          replicatedQuantity: targetQuantity,
          replicatedPrice: protectedPrice,
          status: CopyOrderStatus.COMPLETED,
          failureReason: null,
        });
      } catch (orderErr: unknown) {
        const failureReason = (orderErr as Error).message || 'ORDER_SUBMISSION_FAILED';
        this.logger.error(
          `Failed to place copied order for follower ${subscriber.followerUserId}: ${failureReason}`,
        );

        await this.copyOrdersHistoryRepository.create({
          subscriptionId: subscriber.id,
          masterTradeId: task.tradeId,
          followerOrderId: null,
          pair: task.pair,
          masterSide: task.side,
          replicatedQuantity: targetQuantity,
          replicatedPrice: protectedPrice,
          status: CopyOrderStatus.FAILED,
          failureReason,
        });
      }
    } finally {
      // 6. Always release lock in finally block
      await this.distributedLockService.releaseLock(lockKey, lockToken);
    }
  }
}
