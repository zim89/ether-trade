import { OrderSide, OrderType } from '@app/contracts';
import type { Order } from '../database/schema/orders.schema';

export interface OrderbookEntry {
  orderId: string;
  userId: string;
  pair: string;
  side: OrderSide;
  type: OrderType;
  price: string;
  amount: string;
  remainingAmount: string;
  createdAt: number;
}

export interface MatchedTrade {
  tradeId: string;
  makerOrderId: string;
  takerOrderId: string;
  makerUserId: string;
  takerUserId: string;
  buyOrderId: string;
  sellOrderId: string;
  buyerUserId: string;
  sellerUserId: string;
  symbol: string;
  price: string;
  quantity: string;
  buyerLimitPrice: string;
  buyerFee: string;
  sellerFee: string;
}

export interface MatchResult {
  takerOrder: Order;
  makerOrdersUpdated: Order[];
  trades: MatchedTrade[];
}
