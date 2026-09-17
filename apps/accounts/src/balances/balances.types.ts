import { Currency } from '@app/common/constants';

/**
 * Parameters for depositing funds into an account balance.
 */
export interface DepositParams {
  userId: string;
  currency: Currency;
  amount: string;
  idempotencyKey?: string;
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
