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
 * Discriminated result of a balance mutation executed inside the repository.
 * Transport exceptions are thrown by the service layer, not the repository.
 */
export type BalanceMutationResult =
  | { status: 'ok'; account: Account }
  | { status: 'idempotent_replay'; account: Account }
  | { status: 'not_found' }
  | { status: 'insufficient_available'; available: string }
  | { status: 'insufficient_locked'; locked: string }
  | { status: 'idempotency_payload_mismatch' };

export type ExpectedLedgerType =
  | typeof LedgerTransactionType.DEPOSIT
  | typeof LedgerTransactionType.LOCK
  | typeof LedgerTransactionType.UNLOCK;
