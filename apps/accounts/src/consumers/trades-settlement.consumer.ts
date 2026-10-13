import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, inArray, sql } from 'drizzle-orm';
import { SHARED_ENV_DEFAULTS, SHARED_ENV_KEYS } from '@app/common/constants';
import { BaseKafkaConsumer } from '@app/common/kafka/kafka-consumer.abstract';
import { KafkaProducerService } from '@app/common/kafka/kafka-producer.service';
import {
  getKafkaTopicName,
  KAFKA_CONSUMER_GROUPS,
  KAFKA_DOMAINS,
  KAFKA_TOPIC_EVENTS,
} from '@app/common/kafka/kafka.constants';
import { KafkaBatchConsumerPayload } from '@app/common/kafka/kafka.types';
import type { DomainEventEnvelope, TradeExecutedEvent } from '@app/contracts';
import { BalancesRepository } from '../balances/balances.repository';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import { accounts, Account } from '../database/schema/accounts.schema';
import { ledgerTransactions } from '../database/schema/ledger-transactions.schema';
import { ProcessedEventsRepository } from './processed-events.repository';
import {
  buildSettlementLedgerParams,
  calculateSettlementAmounts,
} from './utils/trades-settlement.util';

@Injectable()
export class TradesSettlementConsumer extends BaseKafkaConsumer {
  protected override readonly logger = new Logger(TradesSettlementConsumer.name);

  constructor(
    configService: ConfigService,
    producerService: KafkaProducerService,
    private readonly balancesRepository: BalancesRepository,
    private readonly processedEventsRepository: ProcessedEventsRepository,
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {
    const appEnv = (
      configService.get<string>(SHARED_ENV_KEYS.appEnv) || SHARED_ENV_DEFAULTS.appEnv
    ).toLowerCase();
    const tradeTopic = getKafkaTopicName(
      appEnv,
      KAFKA_DOMAINS.matching,
      KAFKA_TOPIC_EVENTS.tradeExecuted,
    );

    super(configService, producerService, {
      groupId: KAFKA_CONSUMER_GROUPS.accountsSettlement,
      topics: [tradeTopic],
      fromBeginning: false,
    });
  }

  /**
   * Processes a single TradeExecuted message within a transaction with deterministic ordering.
   */
  async handleMessage(payload: KafkaBatchConsumerPayload): Promise<void> {
    const envelope = payload.value as DomainEventEnvelope<TradeExecutedEvent>;

    if (!envelope || !envelope.payload || !envelope.eventId) {
      throw new Error(
        `INVALID_EVENT_SCHEMA: Missing envelope or payload at offset ${payload.offset}`,
      );
    }

    const trade = envelope.payload;

    // 1. Guard against self-trading
    if (trade.buyerUserId === trade.sellerUserId) {
      this.logger.warn(
        `Self-trade detected in settlement for trade ${trade.tradeId} (user: ${trade.buyerUserId}). Skipping processing.`,
      );
      return;
    }

    const { baseCurrency, quoteCurrency, quoteCost, baseQuantity, surplusRefund } =
      calculateSettlementAmounts(trade);

    // 2. Pre-transaction guarantee: findOrCreate all 4 participant accounts
    const [buyerQuote, buyerBase, sellerQuote, sellerBase] = await Promise.all([
      this.balancesRepository.findOrCreate(trade.buyerUserId, quoteCurrency),
      this.balancesRepository.findOrCreate(trade.buyerUserId, baseCurrency),
      this.balancesRepository.findOrCreate(trade.sellerUserId, quoteCurrency),
      this.balancesRepository.findOrCreate(trade.sellerUserId, baseCurrency),
    ]);

    const accountIds = [buyerQuote.id, buyerBase.id, sellerQuote.id, sellerBase.id];

    // 3. Single ACID transaction with deterministic lock acquisition (Deadlock-Free)
    await this.db.transaction(async (tx) => {
      // 3.1 Idempotency check in processed_events
      const isProcessed = await this.processedEventsRepository.isEventProcessed(
        envelope.eventId,
        tx,
      );
      if (isProcessed) {
        this.logger.warn(`Event ${envelope.eventId} already processed, skipping settlement.`);
        return;
      }

      // 3.2 Deterministic locking: ORDER BY id ASC FOR UPDATE (Prevents Postgres 40P01 Deadlocks)
      const lockedAccounts = await tx
        .select()
        .from(accounts)
        .where(inArray(accounts.id, accountIds))
        .orderBy(accounts.id)
        .for('update');

      // 3.3 O(1) Indexing of accounts map
      const accountsMap = new Map<string, Account>();
      for (const acc of lockedAccounts) {
        accountsMap.set(acc.id, acc);
      }

      const lockedBuyerQuote = accountsMap.get(buyerQuote.id);
      const lockedBuyerBase = accountsMap.get(buyerBase.id);
      const lockedSellerQuote = accountsMap.get(sellerQuote.id);
      const lockedSellerBase = accountsMap.get(sellerBase.id);

      if (!lockedBuyerQuote || !lockedBuyerBase || !lockedSellerQuote || !lockedSellerBase) {
        throw new Error(`Failed to acquire locks on all 4 accounts for trade ${trade.tradeId}`);
      }

      // 3.4 Execute balance updates and generate ledger entries
      const ledgerParams = buildSettlementLedgerParams(
        trade,
        { baseCurrency, quoteCurrency, quoteCost, baseQuantity, surplusRefund },
        {
          buyerQuoteId: buyerQuote.id,
          buyerBaseId: buyerBase.id,
          sellerQuoteId: sellerQuote.id,
          sellerBaseId: sellerBase.id,
        },
      );

      // Apply updates to Buyer Quote (deduct locked cost, refund surplus from locked to available)
      const [updatedBuyerQuote] = await tx
        .update(accounts)
        .set({
          availableBalance: sql`${accounts.availableBalance} + ${surplusRefund}::numeric`,
          lockedBalance: sql`${accounts.lockedBalance} - (${quoteCost}::numeric + ${surplusRefund}::numeric)`,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, buyerQuote.id))
        .returning();

      // Apply updates to Buyer Base (credit purchased base asset to availableBalance)
      const [updatedBuyerBase] = await tx
        .update(accounts)
        .set({
          availableBalance: sql`${accounts.availableBalance} + ${baseQuantity}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, buyerBase.id))
        .returning();

      // Apply updates to Seller Base (deduct locked base volume)
      const [updatedSellerBase] = await tx
        .update(accounts)
        .set({
          lockedBalance: sql`${accounts.lockedBalance} - ${baseQuantity}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, sellerBase.id))
        .returning();

      // Apply updates to Seller Quote (credit received proceeds to availableBalance)
      const [updatedSellerQuote] = await tx
        .update(accounts)
        .set({
          availableBalance: sql`${accounts.availableBalance} + ${quoteCost}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, sellerQuote.id))
        .returning();

      // Map balance after states for ledger entries
      const afterBalancesMap = new Map<string, { available: string; locked: string }>([
        [
          buyerQuote.id,
          {
            available: updatedBuyerQuote?.availableBalance ?? '0',
            locked: updatedBuyerQuote?.lockedBalance ?? '0',
          },
        ],
        [
          buyerBase.id,
          {
            available: updatedBuyerBase?.availableBalance ?? '0',
            locked: updatedBuyerBase?.lockedBalance ?? '0',
          },
        ],
        [
          sellerBase.id,
          {
            available: updatedSellerBase?.availableBalance ?? '0',
            locked: updatedSellerBase?.lockedBalance ?? '0',
          },
        ],
        [
          sellerQuote.id,
          {
            available: updatedSellerQuote?.availableBalance ?? '0',
            locked: updatedSellerQuote?.lockedBalance ?? '0',
          },
        ],
      ]);

      // 3.5 Insert Double-Entry ledger transactions
      for (const entry of ledgerParams) {
        const after = afterBalancesMap.get(entry.accountId);
        await tx.insert(ledgerTransactions).values({
          accountId: entry.accountId,
          userId: entry.userId,
          currency: entry.currency,
          type: entry.type,
          amount: entry.amount,
          availableDelta: entry.availableDelta,
          lockedDelta: entry.lockedDelta,
          balanceAfterAvailable: after?.available ?? '0',
          balanceAfterLocked: after?.locked ?? '0',
          referenceId: entry.referenceId,
        });
      }

      // 3.6 Mark event as processed in processed_events
      await this.processedEventsRepository.markEventProcessed(
        {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          consumerGroup: this.options.groupId,
        },
        tx,
      );

      this.logger.log(
        `Successfully settled trade ${trade.tradeId} for pair ${trade.symbol} (${trade.quantity} @ ${trade.price})`,
      );
    });
  }
}
