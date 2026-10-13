import { Injectable, Inject, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SHARED_ENV_DEFAULTS, SHARED_ENV_KEYS } from '@app/common/constants';
import { KafkaProducerService } from '@app/common/kafka/kafka-producer.service';
import {
  getKafkaTopicName,
  KAFKA_CLIENT_IDS,
  KAFKA_DOMAINS,
  KAFKA_HEADERS,
} from '@app/common/kafka/kafka.constants';
import { KafkaProducerRecord } from '@app/common/kafka/kafka.types';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import { TransfersOutboxRepository } from './transfers-outbox.repository';

@Injectable()
export class TransfersOutboxRelayService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TransfersOutboxRelayService.name);
  private isRunning = false;
  private loopPromise: Promise<void> | null = null;
  private currentDelayMs = 100;

  private readonly minDelayMs = 100;
  private readonly maxDelayMs = 2000;
  private readonly backoffFactor = 1.5;
  private readonly batchSize = 50;
  private readonly appEnv: string;

  constructor(
    private readonly outboxRepository: TransfersOutboxRepository,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly configService: ConfigService,
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
  ) {
    this.appEnv = (
      this.configService.get<string>(SHARED_ENV_KEYS.appEnv) || SHARED_ENV_DEFAULTS.appEnv
    ).toLowerCase();
  }

  onModuleInit(): void {
    this.isRunning = true;
    this.loopPromise = this.runPollLoop();
    this.logger.log(
      `TransfersOutboxRelayService started (env: ${this.appEnv}, batch: ${this.batchSize})`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    this.isRunning = false;
    this.logger.log('Stopping TransfersOutboxRelayService...');
    if (this.loopPromise) {
      await this.loopPromise;
    }
    this.logger.log('TransfersOutboxRelayService stopped gracefully');
  }

  private async runPollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const processedCount = await this.processBatch();

        if (processedCount >= this.batchSize) {
          this.currentDelayMs = this.minDelayMs;
        } else if (processedCount === 0) {
          this.currentDelayMs = Math.min(this.currentDelayMs * this.backoffFactor, this.maxDelayMs);
        } else {
          this.currentDelayMs = this.minDelayMs;
        }
      } catch (err: unknown) {
        this.logger.error(
          `Error in Transfers Outbox Relay loop: ${(err as Error).message}`,
          (err as Error).stack,
        );
        this.currentDelayMs = Math.min(this.currentDelayMs * this.backoffFactor, this.maxDelayMs);
      }

      if (this.isRunning) {
        await this.sleep(this.currentDelayMs);
      }
    }
  }

  /**
   * Processes a batch of pending transfers outbox events inside a transaction with SKIP LOCKED.
   */
  async processBatch(): Promise<number> {
    return this.db.transaction(async (tx) => {
      const pendingEvents = await this.outboxRepository.fetchPendingBatch(this.batchSize, tx);

      if (!pendingEvents.length) {
        return 0;
      }

      const records: KafkaProducerRecord[] = [];
      const publishedIds: string[] = [];

      for (const event of pendingEvents) {
        const topic = getKafkaTopicName(this.appEnv, KAFKA_DOMAINS.transfers, event.eventType);

        records.push({
          topic,
          key: event.partitionKey,
          value: event.payload,
          headers: {
            [KAFKA_HEADERS.originService]: KAFKA_CLIENT_IDS.transfers,
            [KAFKA_HEADERS.eventId]: event.id,
            [KAFKA_HEADERS.aggregateId]: event.aggregateId,
          },
        });

        publishedIds.push(event.id);
      }

      try {
        await this.kafkaProducer.sendBatch(records);
        await this.outboxRepository.markAsPublished(publishedIds, tx);
        this.logger.log(`Transfers Outbox Relay published ${records.length} events to Kafka`);
        return records.length;
      } catch (publishErr: unknown) {
        const errorMsg = (publishErr as Error).message;
        this.logger.error(`Transfers Kafka batch publish failed: ${errorMsg}`);

        for (const id of publishedIds) {
          await this.outboxRepository.recordRetryAttempt(id, errorMsg, tx);
        }
        throw publishErr;
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
