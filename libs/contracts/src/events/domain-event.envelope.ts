/**
 * Closed set of domain event types emitted across platform microservices.
 */
export enum DomainEventType {
  ORDER_PLACED = 'order.placed',
  ORDER_CANCELLED = 'order.cancelled',
  ORDER_FILLED = 'order.filled',
  TRADE_EXECUTED = 'matching.trade_executed',
  DEPOSIT_CONFIRMED = 'transfers.deposit_confirmed',
  WITHDRAWAL_COMPLETED = 'transfers.withdrawal_completed',
  WITHDRAWAL_FAILED = 'transfers.withdrawal_failed',
}

/**
 * Standard domain event envelope ensuring consistent metadata across all Kafka events.
 */
export interface DomainEventEnvelope<T = unknown> {
  /**
   * Unique event identifier in UUIDv7 format.
   */
  readonly eventId: string;

  /**
   * Domain event type discriminator.
   */
  readonly eventType: DomainEventType;

  /**
   * Identifier of the root aggregate that emitted the event (e.g. orderId, tradeId, userId).
   */
  readonly aggregateId: string;

  /**
   * Sharding partition key for Apache Kafka (e.g. trading pair symbol for exchange trades, userId for account events).
   */
  readonly partitionKey: string;

  /**
   * Milliseconds timestamp since Unix epoch when the event occurred.
   */
  readonly timestamp: number;

  /**
   * Correlation identifier in UUIDv7 format for distributed tracing across services.
   */
  readonly correlationId: string;

  /**
   * Domain-specific event payload.
   */
  readonly payload: T;
}
