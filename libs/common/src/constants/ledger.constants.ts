/**
 * Types of ledger transactions for balance accounting and audit trail across services.
 */
export enum LedgerTransactionType {
  DEPOSIT = 'deposit',
  LOCK = 'lock',
  UNLOCK = 'unlock',
}

/**
 * Statuses of ledger transactions.
 */
export enum LedgerTransactionStatus {
  COMPLETED = 'completed',
}
