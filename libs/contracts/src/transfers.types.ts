/**
 * Lifecycle status of an on-chain deposit.
 */
export enum DepositStatus {
  CONFIRMED = 'CONFIRMED',
  CREDITED = 'CREDITED',
  PENDING = 'PENDING',
  REJECTED_UNSUPPORTED_TOKEN = 'REJECTED_UNSUPPORTED_TOKEN',
  REJECTED_BELOW_MINIMUM = 'REJECTED_BELOW_MINIMUM',
}

/**
 * Lifecycle status of an on-chain withdrawal request.
 */
export enum WithdrawalStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
