/**
 * Standard machine-readable error codes shared across the platform.
 */
export const COMMON_ERROR_CODES = {
  serviceNotAllowed: 'SERVICE_NOT_ALLOWED',
  deadlineExceeded: 'DEADLINE_EXCEEDED',
  internalServerError: 'INTERNAL_SERVER_ERROR',
} as const;

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
  grpc: {
    serviceNotAllowed: (serviceId: string) =>
      `Calling service '${serviceId || 'unknown'}' is not authorized to perform this operation`,
    upstreamTimeout: 'Upstream microservice request timed out',
  },
} as const;
