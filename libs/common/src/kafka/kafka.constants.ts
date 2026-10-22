/**
 * Standard tracing, action, and DLQ header names for Kafka domain events.
 */
export const KAFKA_HEADERS = {
  correlationId: 'x-correlation-id',
  originService: 'x-origin-service',
  eventId: 'x-event-id',
  aggregateId: 'x-aggregate-id',
  action: 'x-action',
  dlqOriginalTopic: 'x-dlq-original-topic',
  dlqOriginalOffset: 'x-dlq-original-offset',
  dlqError: 'x-dlq-error',
  dlqTimestamp: 'x-dlq-timestamp',
  traceparent: 'traceparent',
  tracestate: 'tracestate',
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
 * <environment>.<domain>.lifecycle
 */
export const KAFKA_DOMAINS = {
  orders: 'orders',
  matching: 'matching',
  transfers: 'transfers',
  copyTrading: 'copy-trading',
} as const;

/**
 * Standard Consumer Group names.
 */
export const KAFKA_CONSUMER_GROUPS = {
  accountsSettlement: 'accounts-settlement-group',
  transfersAudit: 'transfers-audit-group',
  apiGatewayWs: 'api-gateway-ws-group',
  copyTradingReplication: 'copy-trading-replication-group',
} as const;

/**
 * Generates canonical Kafka lifecycle topic name conforming to:
 * <environment>.<domain>.lifecycle
 *
 * Example: dev.orders.lifecycle
 */
export function getKafkaTopicName(environment: string, domain: string): string {
  const cleanEnv = environment.trim().toLowerCase();
  const cleanDomain = domain.trim().toLowerCase();

  return `${cleanEnv}.${cleanDomain}.lifecycle`;
}
