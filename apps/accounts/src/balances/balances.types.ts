import { Currency, LedgerTransactionType } from '@app/common/constants';
import type { Account } from '../database/schema/accounts.schema';

/**
 * Parameters for depositing funds into an account balance.
 */
export interface DepositParams {
  userId: string;
  currency: Currency;
  amount: string;
  idempotencyKey: string;
}

/**
 * Parameters for locking available funds (e.g., placing an order).
 */
export interface LockParams extends DepositParams {
  referenceId?: string;
}

/**
 * Parameters for unlocking previously locked funds (e.g., cancelling an order).
 */
export type UnlockParams = LockParams;

/**
 * Parameters for crediting confirmed on-chain deposit funds.
 */
export interface CreditDepositParams extends DepositParams {
  referenceId?: string;
}

/**
 * Parameters for debiting confirmed on-chain withdrawal funds.
 */
export interface DebitWithdrawalParams extends DepositParams {
  referenceId?: string;
}

/**
 * Status of a balance mutation operation.
 */
export enum BalanceMutationStatus {
  OK = 'ok',
  IDEMPOTENT_REPLAY = 'idempotent_replay',
  NOT_FOUND = 'not_found',
  INSUFFICIENT_AVAILABLE = 'insufficient_available',
  INSUFFICIENT_LOCKED = 'insufficient_locked',
  IDEMPOTENCY_PAYLOAD_MISMATCH = 'idempotency_payload_mismatch',
}

/**
 * Discriminated result of a balance mutation executed inside the repository.
 * Transport exceptions are thrown by the service layer, not the repository.
 */
export type BalanceMutationResult =
  | { status: BalanceMutationStatus.OK; account: Account }
  | { status: BalanceMutationStatus.IDEMPOTENT_REPLAY; account: Account }
  | { status: BalanceMutationStatus.NOT_FOUND }
  | { status: BalanceMutationStatus.INSUFFICIENT_AVAILABLE; available: string }
  | { status: BalanceMutationStatus.INSUFFICIENT_LOCKED; locked: string }
  | { status: BalanceMutationStatus.IDEMPOTENCY_PAYLOAD_MISMATCH };

export type ExpectedLedgerType =
  | typeof LedgerTransactionType.DEPOSIT
  | typeof LedgerTransactionType.LOCK
  | typeof LedgerTransactionType.UNLOCK
  | typeof LedgerTransactionType.ON_CHAIN_DEPOSIT
  | typeof LedgerTransactionType.WITHDRAWAL;
