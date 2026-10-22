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
import { TelemetryMetricsService } from '@app/common/telemetry';
import { OutboxAggregateType } from '@app/contracts';
import { DRIZZLE_CLIENT } from '../database/database.constants';
import type { DrizzleDB } from '../database/database.module';
import { OutboxRepository } from './outbox.repository';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayService.name);
  private isRunning = false;
  private loopPromise: Promise<void> | null = null;
  private currentDelayMs = 100;

  private readonly minDelayMs = 100;
  private readonly maxDelayMs = 2000;
  private readonly backoffFactor = 1.5;
  private readonly batchSize = 50;
  private readonly appEnv: string;

  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly configService: ConfigService,
    @Inject(DRIZZLE_CLIENT)
    private readonly db: DrizzleDB,
    private readonly telemetryMetrics: TelemetryMetricsService,
  ) {
    this.appEnv = (
      this.configService.get<string>(SHARED_ENV_KEYS.appEnv) || SHARED_ENV_DEFAULTS.appEnv
    ).toLowerCase();
  }

  onModuleInit(): void {
    this.isRunning = true;
    this.loopPromise = this.runPollLoop();
    this.logger.log(`OutboxRelayService started (env: ${this.appEnv}, batch: ${this.batchSize})`);
  }

  async onApplicationShutdown(): Promise<void> {
    this.isRunning = false;
    this.logger.log('Stopping OutboxRelayService...');
    if (this.loopPromise) {
      await this.loopPromise;
    }
    this.logger.log('OutboxRelayService stopped gracefully');
  }

  private async runPollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const processedCount = await this.processBatch();

        if (processedCount >= this.batchSize) {
          // Full batch, immediately process next batch to drain queue fast
          this.currentDelayMs = this.minDelayMs;
        } else if (processedCount === 0) {
          // Empty batch, adaptively back off to prevent polling churn
          this.currentDelayMs = Math.min(this.currentDelayMs * this.backoffFactor, this.maxDelayMs);
        } else {
          // Partial batch, reset to base interval
          this.currentDelayMs = this.minDelayMs;
        }
      } catch (err: unknown) {
        this.logger.error(
          `Error in Outbox Relay loop: ${(err as Error).message}`,
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
   * Processes a single batch of pending outbox events inside a transaction with SKIP LOCKED.
   */
  async processBatch(): Promise<number> {
    return this.db.transaction(async (tx) => {
      const pendingEvents = await this.outboxRepository.fetchPendingBatch(this.batchSize, tx);

      if (!pendingEvents.length) {
        return 0;
      }

      // V8 Zero-Allocation / Single-Pass Transformation into KafkaProducerRecord[]
      const records: KafkaProducerRecord[] = [];
      const publishedIds: string[] = [];

      for (const event of pendingEvents) {
        // Topic naming convention: <env>.<domain>.lifecycle
        const domain =
          event.aggregateType === OutboxAggregateType.ORDER
            ? KAFKA_DOMAINS.orders
            : KAFKA_DOMAINS.matching;
        const topic = getKafkaTopicName(this.appEnv, domain);

        const eventAction =
          (event.payload && typeof event.payload === 'object' && 'action' in event.payload
            ? (event.payload as { action?: string }).action
            : undefined) || event.eventType.toUpperCase();

        const headers: Record<string, string> = {
          [KAFKA_HEADERS.originService]: KAFKA_CLIENT_IDS.orders,
          [KAFKA_HEADERS.eventId]: event.id,
          [KAFKA_HEADERS.aggregateId]: event.aggregateId,
          [KAFKA_HEADERS.action]: eventAction,
        };
        if (event.traceparent) {
          headers[KAFKA_HEADERS.traceparent] = event.traceparent;
        }
        if (event.tracestate) {
          headers[KAFKA_HEADERS.tracestate] = event.tracestate;
        }

        records.push({
          topic,
          key: event.partitionKey,
          value: event.payload,
          headers,
        });

        publishedIds.push(event.id);
      }

      try {
        await this.kafkaProducer.sendBatch(records);
        await this.outboxRepository.markAsPublished(publishedIds, tx);
        this.telemetryMetrics.outboxUnprocessedRecordsCount?.add(-records.length, {
          service: KAFKA_CLIENT_IDS.orders,
        });
        this.logger.log(`Outbox Relay published ${records.length} events to Kafka`);
        return records.length;
      } catch (publishErr: unknown) {
        const errorMsg = (publishErr as Error).message;
        this.logger.error(`Kafka batch publish failed: ${errorMsg}`);

        // Record retry attempt on these events
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
