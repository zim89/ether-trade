import { Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { context, metrics, propagation, trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { Consumer, EachBatchPayload, Kafka } from 'kafkajs';
import { CONFIG_NAMESPACES } from '../constants';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConfig } from './kafka.config';
import { KAFKA_HEADERS } from './kafka.constants';
import { KafkaBatchConsumerPayload } from './kafka.types';

export interface BaseKafkaConsumerOptions {
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
}

export abstract class BaseKafkaConsumer implements OnModuleInit, OnApplicationShutdown {
  protected readonly logger = new Logger(this.constructor.name);
  protected kafka: Kafka;
  protected consumer: Consumer;
  protected isRunning = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly producerService: KafkaProducerService,
    protected readonly options: BaseKafkaConsumerOptions,
  ) {
    const config = this.configService.get<KafkaConfig>(CONFIG_NAMESPACES.kafka);
    const brokers = config?.brokers?.length ? config.brokers : ['localhost:9094'];
    const clientId = `${config?.clientId || 'ether-trade'}-${this.options.groupId}`;

    this.kafka = new Kafka({
      clientId,
      brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: this.options.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  /**
   * Starts the Kafka consumer and joins the consumer group.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      await this.consumer.connect();
      for (const topic of this.options.topics) {
        await this.consumer.subscribe({
          topic,
          fromBeginning: this.options.fromBeginning ?? false,
        });
      }

      this.isRunning = true;
      this.logger.log(
        `Consumer started for group "${this.options.groupId}" on topics: [${this.options.topics.join(', ')}]`,
      );

      await this.consumer.run({
        autoCommit: false,
        eachBatchAutoResolve: false,
        eachBatch: async (payload: EachBatchPayload) => {
          await this.processBatch(payload);
        },
      });
    } catch (error) {
      this.logger.error(`Failed to start Kafka consumer for group ${this.options.groupId}`, error);
      throw error;
    }
  }

  /**
   * Gracefully stops the Kafka consumer.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    try {
      await this.consumer.disconnect();
      this.isRunning = false;
      this.logger.log(`Consumer stopped for group "${this.options.groupId}"`);
    } catch (error) {
      this.logger.error(`Error stopping Kafka consumer for group ${this.options.groupId}`, error);
    }
  }

  /**
   * Processes an incoming batch with heartbeat execution and manual commit after successful handling.
   */
  private readonly processBatch = async (batchPayload: EachBatchPayload): Promise<void> => {
    const { batch } = batchPayload;

    for (const message of batch.messages) {
      if (!batchPayload.isRunning() || batchPayload.isStale()) {
        break;
      }

      await batchPayload.heartbeat();

      const headers: Record<string, string> = {};
      if (message.headers) {
        for (const [key, value] of Object.entries(message.headers)) {
          if (value) {
            headers[key] = Buffer.isBuffer(value) ? value.toString('utf-8') : String(value);
          }
        }
      }

      let parsedValue: unknown = null;
      if (message.value) {
        const rawString = message.value.toString('utf-8');
        try {
          parsedValue = JSON.parse(rawString);
        } catch {
          parsedValue = rawString;
        }
      }

      const payload: KafkaBatchConsumerPayload = {
        topic: batch.topic,
        partition: batch.partition,
        offset: message.offset,
        key: message.key ? message.key.toString('utf-8') : null,
        value: parsedValue,
        headers,
        heartbeat: async () => {
          await batchPayload.heartbeat();
        },
      };

      // OpenTelemetry Context Propagation & Consumer Span
      const carrier: Record<string, string> = { ...headers };
      const extractedContext = propagation.extract(context.active(), carrier);
      const spanContext = trace.getSpanContext(extractedContext);

      const spanLinks =
        spanContext && trace.isSpanContextValid(spanContext) ? [{ context: spanContext }] : [];

      const tracer = trace.getTracer('ether-trade-kafka-consumer');
      const spanName = `${batch.topic} process`;

      const span = tracer.startSpan(
        spanName,
        {
          kind: SpanKind.CONSUMER,
          links: spanLinks,
          attributes: {
            'messaging.system': 'kafka',
            'messaging.destination': batch.topic,
            'messaging.destination_kind': 'topic',
            'messaging.kafka.partition': batch.partition,
            'messaging.kafka.message_offset': message.offset,
            'messaging.kafka.consumer_group': this.options.groupId,
          },
        },
        extractedContext,
      );

      const consumerContext = trace.setSpan(extractedContext, span);

      await context.with(consumerContext, async () => {
        try {
          await this.handleMessage(payload);
          span.setStatus({ code: SpanStatusCode.OK });
          batchPayload.resolveOffset(message.offset);
          await batchPayload.commitOffsetsIfNecessary();

          // Record Consumer Lag (highWatermark - messageOffset)
          const highWatermark = BigInt(batch.highWatermark || '0');
          const currentOffset = BigInt(message.offset);
          const lag = Number(highWatermark > currentOffset ? highWatermark - currentOffset : 0n);
          metrics
            .getMeter('ether-trade-metrics')
            .createHistogram('kafka_consumer_lag')
            .record(lag, {
              topic: batch.topic,
              partition: batch.partition,
              consumer_group: this.options.groupId,
            });
        } catch (error: unknown) {
          if (error instanceof Error) {
            span.recordException(error);
          } else {
            span.recordException(new Error(this.stringifyUnknownError(error)));
          }
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : this.stringifyUnknownError(error),
          });

          const isPoisonPill = this.isPoisonPillError(error);

          if (isPoisonPill) {
            this.logger.error(
              `Poison pill detected at offset ${message.offset} on topic ${batch.topic}. Routing to DLQ.`,
              error instanceof Error ? error.stack : this.stringifyUnknownError(error),
            );
            await this.routeToDlq(batch.topic, payload, error);
            batchPayload.resolveOffset(message.offset);
            await batchPayload.commitOffsetsIfNecessary();
          } else {
            this.logger.warn(
              `Transient error processing message at offset ${message.offset} on topic ${batch.topic}. Pausing consumer and propagating error.`,
              error instanceof Error ? error.message : this.stringifyUnknownError(error),
            );
            // Pause consumer to avoid continuous tight loop hammering
            this.consumer.pause([{ topic: batch.topic, partitions: [batch.partition] }]);
            setTimeout(() => {
              if (this.isRunning) {
                this.consumer.resume([{ topic: batch.topic, partitions: [batch.partition] }]);
              }
            }, 5000);
            throw error;
          }
        } finally {
          span.end();
        }
      });
    }
  };

  /**
   * Helper to safely format an unknown error into a string.
   */
  private stringifyUnknownError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null) {
      try {
        return JSON.stringify(error);
      } catch {
        return '[Unserializable Object]';
      }
    }
    return String(error);
  }

  /**
   * Determines whether an error is unrecoverable (poison pill) or transient (e.g. DB connection dropped).
   */
  protected isPoisonPillError(error: unknown): boolean {
    if (!error) return false;
    const msg = this.stringifyUnknownError(error);
    if (msg.includes('SyntaxError') || msg.includes('Unexpected token')) return true;
    if (msg.includes('INVALID_EVENT_SCHEMA') || msg.includes('UNKNOWN_EVENT_TYPE')) return true;
    return false;
  }

  /**
   * Routes poison pills to Dead Letter Queue (<topic>.dlq).
   */
  protected async routeToDlq(
    originalTopic: string,
    payload: KafkaBatchConsumerPayload,
    error: unknown,
  ): Promise<void> {
    const dlqTopic = `${originalTopic}.dlq`;
    const errorDetails =
      error instanceof Error ? error.stack || error.message : this.stringifyUnknownError(error);

    try {
      await this.producerService.send({
        topic: dlqTopic,
        key: payload.key || 'dlq',
        value: payload.value,
        headers: {
          ...payload.headers,
          [KAFKA_HEADERS.dlqOriginalTopic]: originalTopic,
          [KAFKA_HEADERS.dlqOriginalOffset]: payload.offset,
          [KAFKA_HEADERS.dlqError]: errorDetails,
          [KAFKA_HEADERS.dlqTimestamp]: new Date().toISOString(),
        },
      });
      this.logger.log(`Routed message from offset ${payload.offset} to DLQ topic: ${dlqTopic}`);
    } catch (dlqError) {
      this.logger.error(`Failed to publish message to DLQ topic ${dlqTopic}`, dlqError);
      throw dlqError;
    }
  }

  /**
   * Subclasses implement this method to execute business logic.
   */
  abstract handleMessage(payload: KafkaBatchConsumerPayload): Promise<void>;
}
