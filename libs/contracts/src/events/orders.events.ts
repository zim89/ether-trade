import { OrderSide, OrderType } from '../orders.types';
import type { DomainEventEnvelope } from './domain-event.envelope';

/**
 * Emitted when a new limit or market order is accepted and committed to the order book.
 */
export interface OrderPlacedEvent {
  readonly orderId: string;
  readonly userId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly type: OrderType;
  /** Stringified decimal for exact financial precision (Money Never as JS Number) */
  readonly price: string;
  /** Stringified decimal for exact financial precision */
  readonly quantity: string;
  /** Current aggregate quantity at this price level after insertion */
  readonly levelTotalQuantity: string;
  /** Monotonic sequence identifier for orderbook sync */
  readonly sequenceId: number;
  readonly timestamp: number;
}

/**
 * Emitted when an order is cancelled by the trader or system.
 */
export interface OrderCancelledEvent {
  readonly orderId: string;
  readonly userId: string;
  readonly symbol: string;
  /** Stringified decimal for exact financial precision */
  readonly price: string;
  /** Stringified decimal for remaining unfilled quantity */
  readonly remainingQuantity: string;
  /** Current aggregate quantity at this price level after cancellation ("0" if empty) */
  readonly levelTotalQuantity: string;
  readonly side: OrderSide;
  /** Monotonic sequence identifier for orderbook sync */
  readonly sequenceId: number;
  readonly reason: string;
  readonly timestamp: number;
}

/**
 * Emitted when an order is fully filled or has a fill iteration.
 */
export interface OrderFilledEvent {
  readonly orderId: string;
  readonly userId: string;
  readonly symbol: string;
  /** Stringified decimal for exact financial precision */
  readonly filledPrice: string;
  /** Stringified decimal for exact financial precision */
  readonly filledQuantity: string;
  /** Stringified decimal for exact financial precision */
  readonly remainingQuantity: string;
  /** Stringified decimal for exact financial precision */
  readonly fee: string;
  readonly timestamp: number;
}

/**
 * Emitted by matching engine when a trade occurs between maker and taker orders.
 * Consumed by accounts microservice for asynchronous balance settlement and api-gateway for WS feed.
 */
export interface TradeExecutedEvent {
  readonly tradeId: string;
  readonly buyOrderId: string;
  readonly sellOrderId: string;
  readonly buyerUserId: string;
  readonly sellerUserId: string;
  readonly symbol: string;
  /** Actual executed trade price as stringified decimal */
  readonly price: string;
  /** Trade executed volume as stringified decimal */
  readonly quantity: string;
  /**
   * Buyer limit price as stringified decimal.
   * Required for calculating buyer locked surplus refund when executed at a better price.
   */
  readonly buyerLimitPrice: string;
  /** Buyer trading fee as stringified decimal ('0' for M4 Zero-Fee MVP) */
  readonly buyerFee: string;
  /** Seller trading fee as stringified decimal ('0' for M4 Zero-Fee MVP) */
  readonly sellerFee: string;
  /** Monotonic sequence identifier for orderbook/trade feed sync */
  readonly sequenceId: number;
  readonly timestamp: number;
}

export type OrderPlacedDomainEvent = DomainEventEnvelope<OrderPlacedEvent>;
export type OrderCancelledDomainEvent = DomainEventEnvelope<OrderCancelledEvent>;
export type OrderFilledDomainEvent = DomainEventEnvelope<OrderFilledEvent>;
export type TradeExecutedDomainEvent = DomainEventEnvelope<TradeExecutedEvent>;
