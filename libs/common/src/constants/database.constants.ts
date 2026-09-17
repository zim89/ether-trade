/**
 * PostgreSQL row-level lock strengths for pessimistic concurrency control (`SELECT ... FOR <STRENGTH>`).
 */
export const PG_LOCK_STRENGTH = {
  update: 'update',
  noKeyUpdate: 'no key update',
  share: 'share',
  keyShare: 'key share',
} as const;

/**
 * Standard PostgreSQL error codes (Class 23 — Integrity Constraint Violation).
 */
export const PG_ERROR_CODES = {
  uniqueViolation: '23505',
} as const;
