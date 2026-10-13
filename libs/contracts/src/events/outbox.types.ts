/**
 * Processing status of an outbox event.
 */
export enum OutboxStatus {
  PENDING = 'PENDING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}

/**
 * Root aggregate type that emitted the outbox event.
 */
export enum OutboxAggregateType {
  ORDER = 'order',
  TRADE = 'trade',
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
}
