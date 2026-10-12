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

export interface MatchResult {
  takerOrder: Order;
  makerOrdersUpdated: Order[];
  trades: Array<{
    makerOrderId: string;
    takerOrderId: string;
    price: string;
    amount: string;
  }>;
}
