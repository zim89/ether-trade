export interface KafkaProducerRecord<T = unknown> {
  topic: string;
  key: string;
  value: T;
  headers?: Record<string, string>;
}

export interface KafkaMessageMetadata {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
}

export interface KafkaBatchConsumerPayload {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: unknown;
  headers: Record<string, string>;
  heartbeat: () => Promise<void>;
}
