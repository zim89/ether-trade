import type { DomainEventEnvelope } from './domain-event.envelope';

/**
 * Emitted when an on-chain deposit is confirmed by blockchain listener and credited.
 */
export interface DepositConfirmedEvent {
  readonly depositId: string;
  readonly userId: string;
  readonly currency: string;
  /** Stringified decimal for exact financial precision (Money Never as JS Number) */
  readonly amount: string;
  readonly txHash: string;
  readonly blockNumber: number;
  readonly timestamp: number;
}

/**
 * Emitted when an on-chain withdrawal is successfully broadcasted and confirmed.
 */
export interface WithdrawalCompletedEvent {
  readonly withdrawalId: string;
  readonly userId: string;
  readonly currency: string;
  /** Stringified decimal for exact financial precision */
  readonly amount: string;
  readonly txHash: string;
  readonly timestamp: number;
}

/**
 * Emitted when a withdrawal fails (revert, timeout, or submission error).
 */
export interface WithdrawalFailedEvent {
  readonly withdrawalId: string;
  readonly userId: string;
  readonly currency: string;
  /** Stringified decimal for exact financial precision */
  readonly amount: string;
  readonly txHash: string;
  readonly reason?: string;
  readonly timestamp: number;
}

export type DepositConfirmedDomainEvent = DomainEventEnvelope<DepositConfirmedEvent>;
export type WithdrawalCompletedDomainEvent = DomainEventEnvelope<WithdrawalCompletedEvent>;
export type WithdrawalFailedDomainEvent = DomainEventEnvelope<WithdrawalFailedEvent>;
