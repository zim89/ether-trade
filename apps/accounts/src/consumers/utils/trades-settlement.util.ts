import BigNumber from 'bignumber.js';
import { Currency, LedgerTransactionType } from '@app/common/constants';
import type { TradeExecutedEvent } from '@app/contracts';

export interface SettlementAmounts {
  /** Actual cost of trade: price * quantity in quote asset */
  quoteCost: string;
  /** Volume of trade: quantity in base asset */
  baseQuantity: string;
  /** Amount to unlock/refund to buyer: (buyerLimitPrice - price) * quantity in quote asset */
  surplusRefund: string;
  /** Base currency symbol (e.g. BTC, ETH) */
  baseCurrency: Currency;
  /** Quote currency symbol (e.g. USDT) */
  quoteCurrency: Currency;
}

export interface SettlementLedgerEntry {
  accountId: string;
  userId: string;
  currency: Currency;
  type: LedgerTransactionType;
  amount: string;
  availableDelta: string;
  lockedDelta: string;
  referenceId: string;
}

/**
 * Pure calculation utility for trade settlement amounts and surplus refund.
 * Formula for Surplus Refund: max(0, (buyerLimitPrice - executionPrice) * quantity).
 */
export function calculateSettlementAmounts(trade: TradeExecutedEvent): SettlementAmounts {
  const [baseRaw, quoteRaw] = trade.symbol.split('_');
  const baseCurrency = baseRaw as Currency;
  const quoteCurrency = quoteRaw as Currency;

  const priceBn = new BigNumber(trade.price);
  const quantityBn = new BigNumber(trade.quantity);
  const buyerLimitPriceBn = new BigNumber(trade.buyerLimitPrice);

  const quoteCost = priceBn.multipliedBy(quantityBn).toFixed(8);
  const baseQuantity = quantityBn.toFixed(8);

  let surplusRefund = '0';
  if (buyerLimitPriceBn.isGreaterThan(priceBn)) {
    surplusRefund = buyerLimitPriceBn.minus(priceBn).multipliedBy(quantityBn).toFixed(8);
  }

  return {
    quoteCost,
    baseQuantity,
    surplusRefund,
    baseCurrency,
    quoteCurrency,
  };
}

/**
 * Builds ledger parameter descriptions for all 4 accounts involved in trade settlement.
 */
export function buildSettlementLedgerParams(
  trade: TradeExecutedEvent,
  amounts: SettlementAmounts,
  accountIds: {
    buyerQuoteId: string;
    buyerBaseId: string;
    sellerQuoteId: string;
    sellerBaseId: string;
  },
): SettlementLedgerEntry[] {
  const entries: SettlementLedgerEntry[] = [];

  // 1. Buyer Quote: Deduct locked actual cost. If surplus refund exists, release remainder from locked to available.
  const buyerLockedDeduction = new BigNumber(amounts.quoteCost)
    .plus(new BigNumber(amounts.surplusRefund))
    .toFixed(8);

  entries.push({
    accountId: accountIds.buyerQuoteId,
    userId: trade.buyerUserId,
    currency: amounts.quoteCurrency,
    type: LedgerTransactionType.TRADE_SETTLEMENT,
    amount: amounts.quoteCost,
    availableDelta: amounts.surplusRefund,
    lockedDelta: `-${buyerLockedDeduction}`,
    referenceId: trade.tradeId,
  });

  // 2. Buyer Base: Credit purchased base quantity into availableBalance
  entries.push({
    accountId: accountIds.buyerBaseId,
    userId: trade.buyerUserId,
    currency: amounts.baseCurrency,
    type: LedgerTransactionType.TRADE_SETTLEMENT,
    amount: amounts.baseQuantity,
    availableDelta: amounts.baseQuantity,
    lockedDelta: '0',
    referenceId: trade.tradeId,
  });

  // 3. Seller Base: Deduct locked base quantity
  entries.push({
    accountId: accountIds.sellerBaseId,
    userId: trade.sellerUserId,
    currency: amounts.baseCurrency,
    type: LedgerTransactionType.TRADE_SETTLEMENT,
    amount: amounts.baseQuantity,
    availableDelta: '0',
    lockedDelta: `-${amounts.baseQuantity}`,
    referenceId: trade.tradeId,
  });

  // 4. Seller Quote: Credit received quote proceeds into availableBalance
  entries.push({
    accountId: accountIds.sellerQuoteId,
    userId: trade.sellerUserId,
    currency: amounts.quoteCurrency,
    type: LedgerTransactionType.TRADE_SETTLEMENT,
    amount: amounts.quoteCost,
    availableDelta: amounts.quoteCost,
    lockedDelta: '0',
    referenceId: trade.tradeId,
  });

  return entries;
}
