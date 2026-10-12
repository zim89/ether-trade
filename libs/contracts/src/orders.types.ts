/**
 * Order side on the exchange.
 */
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

/**
 * Order execution type.
 */
export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

/**
 * Lifecycle status of an order.
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}
