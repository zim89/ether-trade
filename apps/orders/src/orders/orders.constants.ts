export const ORDERS_ERROR_CODES = {
  orderNotFound: 'ORDER_NOT_FOUND',
  orderAlreadyFilled: 'ORDER_ALREADY_FILLED',
  orderAlreadyCancelled: 'ORDER_ALREADY_CANCELLED',
  insufficientBalance: 'INSUFFICIENT_BALANCE',
  invalidOrderPrice: 'INVALID_ORDER_PRICE',
  invalidOrderAmount: 'INVALID_ORDER_AMOUNT',
  unsupportedPair: 'UNSUPPORTED_PAIR',
  idempotencyInProgress: 'IDEMPOTENCY_IN_PROGRESS',
  idempotencyKeyPayloadMismatch: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
} as const;

export const ORDERS_ERRORS = {
  orderNotFound: (id: string) => `Order not found: ${id}`,
  orderAlreadyFilled: (id: string) => `Order ${id} is already filled and cannot be cancelled`,
  orderAlreadyCancelled: (id: string) => `Order ${id} is already cancelled`,
  insufficientBalance: (currency: string, required: string) =>
    `Insufficient ${currency} balance to place order, required: ${required}`,
  invalidPrice: 'Order price must be a positive number',
  invalidAmount: 'Order amount must be a positive number',
  unsupportedPair: (pair: string) => `Unsupported trading pair: ${pair}`,
  idempotencyInProgress: 'Order operation is already in progress, please retry shortly',
  idempotencyPayloadMismatch: 'Idempotency key reused with different request payload',
} as const;

export const ORDERS_LOGS = {
  orderCreated: (orderId: string, userId: string, pair: string, side: string) =>
    `Order created: ${orderId} by user ${userId} (${side} ${pair})`,
  orderMatched: (orderId: string, matchedWithId: string, price: string, amount: string) =>
    `Order matched: ${orderId} with ${matchedWithId} at ${price} for ${amount}`,
  orderCancelled: (orderId: string, userId: string) =>
    `Order cancelled: ${orderId} by user ${userId}`,
  orderbookRehydrated: (count: number, pair: string) =>
    `Orderbook rehydrated from DB: ${count} active orders loaded for pair ${pair}`,
} as const;

export const ORDER_REDIS_KEYS = {
  orderbookBids: (pair: string) => `orderbook:buy:${pair}`,
  orderbookAsks: (pair: string) => `orderbook:sell:${pair}`,
  orderDetails: (orderId: string) => `order:${orderId}`,
  orderbookSequence: (pair: string) => `orderbook:seq:${pair}`,
} as const;

export const SUPPORTED_PAIRS = ['BTC_USDT', 'ETH_USDT'] as const;
export type SupportedPair = (typeof SUPPORTED_PAIRS)[number];
