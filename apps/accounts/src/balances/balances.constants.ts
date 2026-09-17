import { SUPPORTED_CURRENCIES } from '@app/common/constants';

export const SANDBOX_DEPOSIT_MAX = '1000000';
export const DECIMAL_SCALE = 8;
export const AMOUNT_REGEX = /^(0|[1-9]\d*)(\.\d{1,8})?$/;

export const BALANCES_ERRORS = {
  accountNotFound: (userId: string, currency: string) =>
    `Account not found for user '${userId}' and currency '${currency}'`,
  invalidUserId: 'Invalid user ID format: must be a valid UUID',
  invalidAmount: 'Amount must be a positive decimal number',
  invalidAmountDecimals: 'Amount cannot exceed 8 decimal places',
  depositLimitExceeded: (max: string) => `Deposit amount exceeds sandbox maximum of ${max}`,
  insufficientAvailableBalance: (available: string, required: string) =>
    `Insufficient available balance: requested ${required}, available ${available}`,
  insufficientLockedBalance: (locked: string, required: string) =>
    `Insufficient locked balance: requested ${required}, locked ${locked}`,
  unsupportedCurrency: (currency: string) =>
    `Unsupported currency '${currency}'. Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`,
  accountCreateFailed: (userId: string, currency: string) =>
    `Failed to create or find account for user: ${userId} and currency: ${currency}`,
} as const;

/**
 * Diagnostic log messages for the balances module.
 */
export const BALANCES_LOGS = {
  depositRequested: (userId: string, amount: string, currency: string) =>
    `Deposit requested for user ${userId}: +${amount} ${currency}`,
  lockRequested: (userId: string, amount: string, currency: string) =>
    `Lock requested for user ${userId}: ${amount} ${currency}`,
  unlockRequested: (userId: string, amount: string, currency: string) =>
    `Unlock requested for user ${userId}: ${amount} ${currency}`,
} as const;
