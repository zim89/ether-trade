export const COPY_TRADING_CONSTANTS = {
  defaultLockTtlMs: 10000,
  minAllocatedBalance: '10.00000000',
  maxSlippagePercentDefault: '1.00',
  followerBatchConcurrency: 50,
  masterBalanceCacheTtlSeconds: 5,
} as const;

export const COPY_TRADING_REDIS_KEYS = {
  followerLock: (followerUserId: string) => `lock:copy:follower:${followerUserId}`,
  activeMastersSet: 'copy:active_masters_set',
  masterStats: (masterId: string) => `copy:master:stats:${masterId}`,
  masterBalance: (masterId: string, currency: string) =>
    `copy:master:balance:${masterId}:${currency}`,
} as const;

export const COPY_TRADING_ERRORS = {
  masterNotFound: (masterId: string) => `Master trader with ID "${masterId}" was not found`,
  masterInactive: (masterId: string) => `Master trader with ID "${masterId}" is currently inactive`,
  insufficientDeposit: (minDeposit: string) =>
    `Allocated balance cannot be less than minimum deposit of ${minDeposit}`,
  subscriptionAlreadyExists: (masterId: string) =>
    `Active subscription to master "${masterId}" already exists`,
  subscriptionNotFound: (subscriptionId: string) =>
    `Subscription with ID "${subscriptionId}" was not found`,
  lockAcquisitionFailed: (followerId: string) =>
    `Failed to acquire distributed lock for follower "${followerId}"`,
  allocationExceedsBalance: (requested: string, available: string) =>
    `Total active allocations plus requested ${requested} exceeds available balance of ${available}`,
  orderBelowMinLot: (calculated: string, minLot: string) =>
    `Calculated order size ${calculated} is below minimum lot size of ${minLot}`,
  unsupportedPair: (pair: string) => `Unsupported trading pair: ${pair}`,
} as const;

export const COPY_TRADING_ERROR_CODES = {
  masterNotFound: 'MASTER_NOT_FOUND',
  masterInactive: 'MASTER_INACTIVE',
  insufficientDeposit: 'INSUFFICIENT_DEPOSIT',
  subscriptionAlreadyExists: 'SUBSCRIPTION_ALREADY_EXISTS',
  subscriptionNotFound: 'SUBSCRIPTION_NOT_FOUND',
  lockAcquisitionFailed: 'LOCK_ACQUISITION_FAILED',
  allocationExceedsBalance: 'ALLOCATION_EXCEEDS_BALANCE',
  orderBelowMinLot: 'ORDER_BELOW_MIN_LOT',
  unsupportedPair: 'UNSUPPORTED_PAIR',
} as const;

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  TERMINATED = 'TERMINATED',
}

export enum CopyOrderStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum CopyOrderSkipReason {
  BELOW_MIN_LOT = 'BELOW_MIN_LOT',
  ZERO_OR_NEGATIVE_POSITION = 'ZERO_OR_NEGATIVE_POSITION',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
}
