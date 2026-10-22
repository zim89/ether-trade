/**
 * Closed set of domain event types emitted across platform microservices.
 */
export const DOMAIN_EVENT_TYPES = {
  orderPlaced: 'order.placed',
  orderCancelled: 'order.cancelled',
  orderFilled: 'order.filled',
  tradeExecuted: 'matching.trade_executed',
  depositConfirmed: 'transfers.deposit_confirmed',
  withdrawalCompleted: 'transfers.withdrawal_completed',
  withdrawalFailed: 'transfers.withdrawal_failed',
} as const;
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];

/**
 * Domain actions for the Orders lifecycle topic.
 */
export const ORDER_ACTIONS = {
  placed: 'ORDER_PLACED',
  cancelled: 'ORDER_CANCELLED',
  filled: 'ORDER_FILLED',
} as const;
export type OrderAction = (typeof ORDER_ACTIONS)[keyof typeof ORDER_ACTIONS];

/**
 * Domain actions for the Matching lifecycle topic.
 */
export const MATCHING_ACTIONS = {
  tradeExecuted: 'TRADE_EXECUTED',
} as const;
export type MatchingAction = (typeof MATCHING_ACTIONS)[keyof typeof MATCHING_ACTIONS];

/**
 * Domain actions for the Transfers lifecycle topic.
 */
export const TRANSFERS_ACTIONS = {
  depositConfirmed: 'DEPOSIT_CONFIRMED',
  withdrawalCompleted: 'WITHDRAWAL_COMPLETED',
  withdrawalFailed: 'WITHDRAWAL_FAILED',
} as const;
export type TransfersAction = (typeof TRANSFERS_ACTIONS)[keyof typeof TRANSFERS_ACTIONS];

/**
 * Standard domain event envelope ensuring consistent metadata across all Kafka events.
 */
export interface DomainEventEnvelope<T = unknown> {
  /**
   * Unique event identifier in UUIDv7 format.
   */
  readonly eventId: string;

  /**
   * Lifecycle action discriminator for the event.
   */
  readonly action?: string;

  /**
   * Domain event type discriminator (legacy/compatibility).
   */
  readonly eventType: DomainEventType | (string & {});

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
