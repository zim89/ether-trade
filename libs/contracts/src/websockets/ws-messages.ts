import { OrderSide, OrderStatus } from '../orders.types';
import { DepositStatus, WithdrawalStatus } from '../transfers.types';

/**
 * Standard WebSocket client action request commands.
 */
export enum WsClientAction {
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  PING = 'ping',
}

/**
 * Incoming WebSocket client payload format (Client -> Server).
 */
export interface WsClientMessage {
  readonly action: WsClientAction;
  readonly channel?: string;
  readonly params?: Record<string, unknown>;
}

/**
 * Type of orderbook streaming update.
 */
export enum WsOrderBookType {
  SNAPSHOT = 'snapshot',
  DELTA = 'delta',
}

/**
 * Full orderbook snapshot emitted on initial subscription to `orderbook:<symbol>`.
 */
export interface WsOrderBookSnapshotMessage {
  readonly channel: string; // e.g. "orderbook:BTC_USDT"
  readonly type: WsOrderBookType.SNAPSHOT;
  readonly sequenceId: number;
  readonly bids: [price: string, quantity: string][];
  readonly asks: [price: string, quantity: string][];
  readonly timestamp: number;
}

/**
 * Incremental orderbook delta update.
 */
export interface WsOrderBookUpdateMessage {
  readonly channel: string; // e.g. "orderbook:BTC_USDT"
  readonly type: WsOrderBookType.DELTA;
  readonly sequenceId: number;
  readonly side: OrderSide;
  readonly price: string;
  readonly quantity: string; // "0" indicates this price level has been cleared
  readonly timestamp: number;
}

/**
 * Public trade broadcast event for `trades:<symbol>`.
 */
export interface WsTradeMessage {
  readonly channel: string; // e.g. "trades:BTC_USDT"
  readonly tradeId: string;
  readonly symbol: string;
  readonly price: string;
  readonly quantity: string;
  readonly side: OrderSide;
  readonly timestamp: number;
}

/**
 * Transfer types for user private transfer stream.
 */
export enum WsTransferType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
}

/**
 * Private order lifecycle update for `user:orders`.
 */
export interface WsUserOrderUpdateMessage {
  readonly channel: 'user:orders';
  readonly orderId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly status: OrderStatus;
  readonly filledQuantity: string;
  readonly remainingQuantity: string;
  readonly timestamp: number;
}

/**
 * Private transfer update for `user:transfers`.
 */
export interface WsUserTransferUpdateMessage {
  readonly channel: 'user:transfers';
  readonly transferId: string;
  readonly type: WsTransferType;
  readonly currency: string;
  readonly amount: string;
  readonly status: DepositStatus | WithdrawalStatus;
  readonly txHash?: string;
  readonly timestamp: number;
}

/**
 * Error message sent to WebSocket client upon invalid frame, subscription or unauthorized action.
 */
export interface WsErrorMessage {
  readonly event: 'error';
  readonly message: string;
  readonly code?: string | number;
  readonly timestamp: number;
}

/**
 * Standard WebSocket channel builders and subscription identifiers.
 */
export const WS_CHANNELS = {
  orderbook: (symbol: string) => `orderbook:${symbol}`,
  trades: (symbol: string) => `trades:${symbol}`,
  userOrders: 'user:orders',
  userTransfers: 'user:transfers',
} as const;

/**
 * Checks if a requested channel name is syntactically valid and supported.
 */
export function isValidChannel(channel: string): boolean {
  if (!channel || typeof channel !== 'string') return false;
  if (channel === WS_CHANNELS.userOrders || channel === WS_CHANNELS.userTransfers) {
    return true;
  }
  const parts = channel.split(':');
  if (parts.length !== 2) return false;
  const [prefix, symbol] = parts;
  if (prefix !== 'orderbook' && prefix !== 'trades') return false;
  return /^[A-Z0-9]+_[A-Z0-9]+$/.test(symbol);
}
