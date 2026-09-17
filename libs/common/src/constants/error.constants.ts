/**
 * Common application exception messages grouped by feature/domain.
 */
export const COMMON_ERRORS = {
  env: {
    validationFailed: (details: string) => `Environment validation failed:\n${details}`,
  },
  redis: {
    connectionFailed: 'Failed to establish Redis/Valkey GLIDE connection',
  },
} as const;
