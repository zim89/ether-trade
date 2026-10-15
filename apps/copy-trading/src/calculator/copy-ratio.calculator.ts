import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';

export interface BuyRatioParams {
  masterOrderQuantity: string;
  masterAvailableUsdt: string;
  followerAllocatedUsdt: string;
}

export interface SellRatioParams {
  masterSellQuantity: string;
  masterTotalBaseAsset: string;
  followerSubPosition: string;
}

@Injectable()
export class CopyRatioCalculator {
  /**
   * Calculates follower order size for BUY orders based on allocated USDT ratio:
   * FollowerSize = MasterQty * (FollowerAllocatedUSDT / MasterAvailableUSDT)
   *
   * High precision calculation using bignumber.js with ROUND_DOWN to prevent margin overdraft.
   */
  calculateBuyQuantity(params: BuyRatioParams, scale = 8): string {
    const masterQty = new BigNumber(params.masterOrderQuantity);
    const masterUsdt = new BigNumber(params.masterAvailableUsdt);
    const followerUsdt = new BigNumber(params.followerAllocatedUsdt);

    if (
      masterUsdt.isLessThanOrEqualTo(0) ||
      followerUsdt.isLessThanOrEqualTo(0) ||
      masterQty.isLessThanOrEqualTo(0)
    ) {
      return new BigNumber(0).toFixed(scale);
    }

    // FollowerSize = masterQty * (followerUsdt / masterUsdt)
    const ratio = followerUsdt.dividedBy(masterUsdt);
    const calculated = masterQty.multipliedBy(ratio);

    return calculated.toFixed(scale, BigNumber.ROUND_DOWN);
  }

  /**
   * Calculates follower order size for SELL orders strictly based on subscription position:
   * FollowerSize = SubPosition(pair) * (MasterSellQty / MasterTotalBaseAsset)
   *
   * If followerSubPosition <= 0 (e.g. follower subscribed while master was already holding position),
   * returns "0.00000000" safely without placing order on exchange.
   */
  calculateSellQuantity(params: SellRatioParams, scale = 8): string {
    const masterSellQty = new BigNumber(params.masterSellQuantity);
    const masterBaseAsset = new BigNumber(params.masterTotalBaseAsset);
    const followerSubPos = new BigNumber(params.followerSubPosition);

    if (
      followerSubPos.isLessThanOrEqualTo(0) ||
      masterBaseAsset.isLessThanOrEqualTo(0) ||
      masterSellQty.isLessThanOrEqualTo(0)
    ) {
      return new BigNumber(0).toFixed(scale);
    }

    // FollowerSize = followerSubPos * (masterSellQty / masterBaseAsset)
    const ratio = masterSellQty.dividedBy(masterBaseAsset);
    // Never sell more than current followerSubPos
    const rawCalculated = followerSubPos.multipliedBy(ratio);
    const capped = BigNumber.min(rawCalculated, followerSubPos);

    return capped.toFixed(scale, BigNumber.ROUND_DOWN);
  }

  /**
   * Helper to calculate net subscription position from historical trade records:
   * SubPosition = SUM(Qty_BUY, COMPLETED) - SUM(Qty_SELL, COMPLETED)
   */
  calculateSubPosition(buyTotal: string, sellTotal: string, scale = 8): string {
    const buy = new BigNumber(buyTotal || 0);
    const sell = new BigNumber(sellTotal || 0);
    const net = buy.minus(sell);

    if (net.isLessThanOrEqualTo(0)) {
      return new BigNumber(0).toFixed(scale);
    }

    return net.toFixed(scale, BigNumber.ROUND_DOWN);
  }
}
