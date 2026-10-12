import { pgTable, bigint, timestamp } from 'drizzle-orm/pg-core';

export const scannerState = pgTable('scanner_state', {
  chainId: bigint('chain_id', { mode: 'number' }).primaryKey(),
  lastScannedBlock: bigint('last_scanned_block', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export type ScannerState = typeof scannerState.$inferSelect;
export type NewScannerState = typeof scannerState.$inferInsert;
