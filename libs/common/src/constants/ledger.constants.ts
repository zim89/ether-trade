/**
 * Types of ledger transactions for balance accounting and audit trail across services.
 */
export enum LedgerTransactionType {
  DEPOSIT = 'deposit',
  LOCK = 'lock',
  UNLOCK = 'unlock',
  ON_CHAIN_DEPOSIT = 'on_chain_deposit',
  WITHDRAWAL = 'withdrawal',
  TRADE_SETTLEMENT = 'trade_settlement',
}

/**
 * Statuses of ledger transactions.
 */
export enum LedgerTransactionStatus {
  COMPLETED = 'completed',
}
