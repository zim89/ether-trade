import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';

export interface ProtectedPriceParams {
  masterPrice: string;
  maxSlippagePercent: string;
  side: 'BUY' | 'SELL';
}

export interface MinLotCheckResult {
  isDust: boolean;
  minLot: string;
  quantity: string;
}

@Injectable()
export class RiskGuardService {
  /** Default minimum lot sizes by trading pair */
  private readonly minLots: Record<string, string> = {
    BTC_USDT: '0.00010000',
    ETH_USDT: '0.00100000',
  };

  /**
   * Calculates protective limit price taking maxSlippagePercent into account:
   * - For BUY:  LimitPrice = MasterPrice * (1 + maxSlippagePercent / 100)
   * - For SELL: LimitPrice = MasterPrice * (1 - maxSlippagePercent / 100)
   */
  calculateProtectedPrice(params: ProtectedPriceParams, scale = 8): string {
    const basePrice = new BigNumber(params.masterPrice);
    const slippage = new BigNumber(params.maxSlippagePercent).dividedBy(100);

    if (params.side === 'BUY') {
      const multiplier = new BigNumber(1).plus(slippage);
      return basePrice.multipliedBy(multiplier).toFixed(scale, BigNumber.ROUND_UP);
    } else {
      const multiplier = new BigNumber(1).minus(slippage);
      const calculated = basePrice.multipliedBy(multiplier);
      const safePrice = BigNumber.max(calculated, new BigNumber('0.00000001'));
      return safePrice.toFixed(scale, BigNumber.ROUND_DOWN);
    }
  }

  /**
   * Dust Protection filter:
   * Checks whether the calculated order quantity satisfies the minimum lot requirement.
   * If quantity < minLot, order is flagged as dust to be SKIPPED.
   */
  checkMinLot(pair: string, quantity: string): MinLotCheckResult {
    const minLot = this.minLots[pair] ?? '0.00010000';
    const qtyBn = new BigNumber(quantity);
    const minLotBn = new BigNumber(minLot);

    const isDust = qtyBn.isLessThan(minLotBn) || qtyBn.isLessThanOrEqualTo(0);

    return {
      isDust,
      minLot,
      quantity,
    };
  }

  /**
   * Sets custom minimum lot for a trading pair (e.g., in tests or dynamic config).
   */
  setMinLot(pair: string, minLot: string): void {
    this.minLots[pair] = minLot;
  }
}
