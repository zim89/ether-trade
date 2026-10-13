/**
 * Standard tracing and DLQ header names for Kafka domain events.
 */
export const KAFKA_HEADERS = {
  correlationId: 'x-correlation-id',
  originService: 'x-origin-service',
  eventId: 'x-event-id',
  aggregateId: 'x-aggregate-id',
  dlqOriginalTopic: 'x-dlq-original-topic',
  dlqOriginalOffset: 'x-dlq-original-offset',
  dlqError: 'x-dlq-error',
  dlqTimestamp: 'x-dlq-timestamp',
} as const;

/**
 * Standard Client IDs for Kafka services.
 */
export const KAFKA_CLIENT_IDS = {
  orders: 'orders-service',
  accounts: 'accounts-service',
  transfers: 'transfers-service',
} as const;

/**
 * Standard domain partitions for Kafka topics conforming to:
 * <environment>.<domain>.<event_name>
 */
export const KAFKA_DOMAINS = {
  orders: 'orders',
  matching: 'matching',
  transfers: 'transfers',
} as const;

/**
 * Standard event names used in Kafka topics (<env>.<domain>.<event>).
 */
export const KAFKA_TOPIC_EVENTS = {
  orderPlaced: 'order_placed',
  orderCancelled: 'order_cancelled',
  orderFilled: 'order_filled',
  tradeExecuted: 'trade_executed',
  depositConfirmed: 'deposit_confirmed',
  withdrawalCompleted: 'withdrawal_completed',
  withdrawalFailed: 'withdrawal_failed',
} as const;

/**
 * Standard Consumer Group names.
 */
export const KAFKA_CONSUMER_GROUPS = {
  accountsSettlement: 'accounts-settlement-group',
  transfersAudit: 'transfers-audit-group',
} as const;

/**
 * Generates standardized Kafka topic name conforming to:
 * <environment>.<domain>.<event_name>
 *
 * Example: dev.matching.trade_executed
 */
export function getKafkaTopicName(environment: string, domain: string, eventName: string): string {
  const cleanEnv = environment.trim().toLowerCase();
  const cleanDomain = domain.trim().toLowerCase();
  const cleanEvent = eventName.trim().toLowerCase();

  return `${cleanEnv}.${cleanDomain}.${cleanEvent}`;
}
