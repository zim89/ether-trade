import { Injectable, Logger } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { OrderSide, OrderStatus } from '@app/contracts';
import type { Order } from '../database/schema/orders.schema';
import { OrderbookService } from './orderbook.service';
import { ORDERS_LOGS } from './orders.constants';
import { OrdersRepository } from './orders.repository';
import { MatchResult, OrderbookEntry } from './orders.types';

@Injectable()
export class MatchingEngineService {
  private readonly logger = new Logger(MatchingEngineService.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly orderbookService: OrderbookService,
  ) {}

  /**
   * Executes matching for an incoming order against opposing orders in the orderbook.
   */
  async match(takerOrder: Order): Promise<MatchResult> {
    const opposingSide =
      (takerOrder.side as OrderSide) === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const opposingOrders = await this.orderbookService.getBestOpposingOrders(
      takerOrder.pair,
      takerOrder.side as OrderSide,
    );

    const trades: MatchResult['trades'] = [];
    const makerOrdersUpdated: Order[] = [];

    let currentTakerRemaining = new BigNumber(takerOrder.remainingAmount);
    let currentTakerFilled = new BigNumber(takerOrder.filledAmount);
    const takerPrice = new BigNumber(takerOrder.price);

    for (const makerEntry of opposingOrders) {
      if (currentTakerRemaining.isZero()) {
        break;
      }

      const makerPrice = new BigNumber(makerEntry.price);

      // Check price crossing condition:
      // BUY taker crosses if takerPrice >= makerPrice
      // SELL taker crosses if takerPrice <= makerPrice
      const isPriceMatch =
        (takerOrder.side as OrderSide) === OrderSide.BUY
          ? takerPrice.isGreaterThanOrEqualTo(makerPrice)
          : takerPrice.isLessThanOrEqualTo(makerPrice);

      if (!isPriceMatch) {
        break;
      }

      const makerRemaining = new BigNumber(makerEntry.remainingAmount);
      const matchAmount = BigNumber.min(currentTakerRemaining, makerRemaining);
      const executionPrice = makerEntry.price; // Maker gets price priority

      // Update taker amounts
      currentTakerRemaining = currentTakerRemaining.minus(matchAmount);
      currentTakerFilled = currentTakerFilled.plus(matchAmount);

      // Update maker amounts
      const newMakerRemaining = makerRemaining.minus(matchAmount);
      const makerOrderInDb = await this.ordersRepository.findById(makerEntry.orderId);
      const currentMakerFilled = makerOrderInDb
        ? new BigNumber(makerOrderInDb.filledAmount).plus(matchAmount)
        : matchAmount;

      const makerStatus = newMakerRemaining.isZero()
        ? OrderStatus.FILLED
        : OrderStatus.PARTIALLY_FILLED;

      const updatedMaker = await this.ordersRepository.updateExecution(makerEntry.orderId, {
        filledAmount: currentMakerFilled.toFixed(8),
        remainingAmount: newMakerRemaining.toFixed(8),
        status: makerStatus,
      });

      if (updatedMaker) {
        makerOrdersUpdated.push(updatedMaker);
      }

      // Update maker state in Redis orderbook
      if (makerStatus === OrderStatus.FILLED) {
        await this.orderbookService.removeOrder(makerEntry.orderId, makerEntry.pair, opposingSide);
      } else {
        await this.orderbookService.updateRemainingAmount(
          makerEntry.orderId,
          newMakerRemaining.toFixed(8),
        );
      }

      trades.push({
        makerOrderId: makerEntry.orderId,
        takerOrderId: takerOrder.id,
        price: executionPrice,
        amount: matchAmount.toFixed(8),
      });

      this.logger.log(
        ORDERS_LOGS.orderMatched(
          takerOrder.id,
          makerEntry.orderId,
          executionPrice,
          matchAmount.toFixed(8),
        ),
      );
    }

    // Determine final status for taker order
    const takerStatus = currentTakerRemaining.isZero()
      ? OrderStatus.FILLED
      : currentTakerFilled.isGreaterThan(0)
        ? OrderStatus.PARTIALLY_FILLED
        : OrderStatus.OPEN;

    const updatedTaker = await this.ordersRepository.updateExecution(takerOrder.id, {
      filledAmount: currentTakerFilled.toFixed(8),
      remainingAmount: currentTakerRemaining.toFixed(8),
      status: takerStatus,
    });

    // If taker still has remaining volume, insert it into the orderbook
    if (!currentTakerRemaining.isZero()) {
      const entry: OrderbookEntry = {
        orderId: takerOrder.id,
        userId: takerOrder.userId,
        pair: takerOrder.pair,
        side: takerOrder.side as OrderSide,
        type: takerOrder.type as OrderbookEntry['type'],
        price: takerOrder.price,
        amount: takerOrder.amount,
        remainingAmount: currentTakerRemaining.toFixed(8),
        createdAt: Math.floor(takerOrder.createdAt.getTime() / 1000),
      };
      await this.orderbookService.addOrder(entry);
    }

    return {
      takerOrder: updatedTaker ?? takerOrder,
      makerOrdersUpdated,
      trades,
    };
  }
}
