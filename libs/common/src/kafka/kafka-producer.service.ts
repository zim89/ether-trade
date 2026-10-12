import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, RecordMetadata } from 'kafkajs';
import { CONFIG_NAMESPACES } from '../constants';
import { KafkaConfig } from './kafka.config';
import { KafkaProducerRecord } from './kafka.types';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.get<KafkaConfig>(CONFIG_NAMESPACES.kafka);
    const brokers = config?.brokers?.length ? config.brokers : ['localhost:9094'];
    const clientId = config?.clientId || 'ether-trade-producer';

    this.kafka = new Kafka({
      clientId,
      brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    try {
      await this.producer.connect();
      this.isConnected = true;
      this.logger.log('Kafka Producer successfully connected');
    } catch (error) {
      this.logger.error('Failed to connect Kafka Producer', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    try {
      await this.producer.disconnect();
      this.isConnected = false;
      this.logger.log('Kafka Producer disconnected');
    } catch (error) {
      this.logger.error('Error during Kafka Producer disconnect', error);
    }
  }

  /**
   * Publishes a single message to a Kafka topic.
   */
  async send<T = unknown>(record: KafkaProducerRecord<T>): Promise<RecordMetadata[]> {
    if (!this.isConnected) {
      await this.connect();
    }

    const stringValue =
      typeof record.value === 'string' ? record.value : JSON.stringify(record.value);

    const headers: Record<string, string> = {
      ...(record.headers || {}),
    };

    return this.producer.send({
      topic: record.topic,
      messages: [
        {
          key: record.key,
          value: stringValue,
          headers,
        },
      ],
    });
  }

  /**
   * Publishes a batch of messages to Kafka.
   */
  async sendBatch<T = unknown>(records: KafkaProducerRecord<T>[]): Promise<RecordMetadata[]> {
    if (!records.length) {
      return [];
    }
    if (!this.isConnected) {
      await this.connect();
    }

    const topicMessagesMap = new Map<
      string,
      Array<{ key: string; value: string; headers?: Record<string, string> }>
    >();

    for (const record of records) {
      const stringValue =
        typeof record.value === 'string' ? record.value : JSON.stringify(record.value);

      const msg = {
        key: record.key,
        value: stringValue,
        headers: record.headers,
      };

      const existing = topicMessagesMap.get(record.topic) || [];
      existing.push(msg);
      topicMessagesMap.set(record.topic, existing);
    }

    const topicMessages = Array.from(topicMessagesMap.entries()).map(([topic, messages]) => ({
      topic,
      messages,
    }));

    return this.producer.sendBatch({
      topicMessages,
    });
  }
}
