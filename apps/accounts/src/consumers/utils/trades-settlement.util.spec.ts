import { Currency, LedgerTransactionType } from '@app/common/constants';
import type { TradeExecutedEvent } from '@app/contracts';
import { calculateSettlementAmounts, buildSettlementLedgerParams } from './trades-settlement.util';

describe('trades-settlement.util', () => {
  it('should calculate settlement amounts correctly when execution price equals buyer limit price', () => {
    const trade: TradeExecutedEvent = {
      tradeId: 'trade-1',
      buyOrderId: 'order-buy-1',
      sellOrderId: 'order-sell-1',
      buyerUserId: 'user-buyer',
      sellerUserId: 'user-seller',
      symbol: 'ETH_USDT',
      price: '3000.00000000',
      quantity: '2.00000000',
      buyerLimitPrice: '3000.00000000',
      buyerFee: '0',
      sellerFee: '0',
      timestamp: Date.now(),
    };

    const amounts = calculateSettlementAmounts(trade);

    expect(amounts.baseCurrency).toBe(Currency.ETH);
    expect(amounts.quoteCurrency).toBe(Currency.USDT);
    expect(amounts.baseQuantity).toBe('2.00000000');
    expect(amounts.quoteCost).toBe('6000.00000000');
    expect(amounts.surplusRefund).toBe('0');
  });

  it('should calculate surplus refund when executed price is better than buyer limit price', () => {
    const trade: TradeExecutedEvent = {
      tradeId: 'trade-2',
      buyOrderId: 'order-buy-2',
      sellOrderId: 'order-sell-2',
      buyerUserId: 'user-buyer',
      sellerUserId: 'user-seller',
      symbol: 'BTC_USDT',
      price: '60000.00000000', // execution price
      quantity: '0.50000000',
      buyerLimitPrice: '62000.00000000', // buyer was willing to pay more
      buyerFee: '0',
      sellerFee: '0',
      timestamp: Date.now(),
    };

    const amounts = calculateSettlementAmounts(trade);

    expect(amounts.quoteCost).toBe('30000.00000000');
    expect(amounts.baseQuantity).toBe('0.50000000');
    // surplus refund = (62000 - 60000) * 0.5 = 2000 * 0.5 = 1000
    expect(amounts.surplusRefund).toBe('1000.00000000');
  });

  it('should build exactly 4 ledger entries with balanced double-entry deltas', () => {
    const trade: TradeExecutedEvent = {
      tradeId: 'trade-3',
      buyOrderId: 'order-buy-3',
      sellOrderId: 'order-sell-3',
      buyerUserId: 'user-buyer',
      sellerUserId: 'user-seller',
      symbol: 'ETH_USDT',
      price: '2800.00000000',
      quantity: '1.00000000',
      buyerLimitPrice: '3000.00000000',
      buyerFee: '0',
      sellerFee: '0',
      timestamp: Date.now(),
    };

    const amounts = calculateSettlementAmounts(trade);
    const accountIds = {
      buyerQuoteId: 'acc-buyer-usdt',
      buyerBaseId: 'acc-buyer-eth',
      sellerQuoteId: 'acc-seller-usdt',
      sellerBaseId: 'acc-seller-eth',
    };

    const entries = buildSettlementLedgerParams(trade, amounts, accountIds);

    expect(entries.length).toBe(4);

    // 1. Buyer USDT: locked deduction = 2800 + 200 = 3000, surplus refund = 200
    const buyerQuoteEntry = entries.find((e) => e.accountId === accountIds.buyerQuoteId);
    expect(buyerQuoteEntry).toBeDefined();
    expect(buyerQuoteEntry?.type).toBe(LedgerTransactionType.TRADE_SETTLEMENT);
    expect(buyerQuoteEntry?.availableDelta).toBe('200.00000000');
    expect(buyerQuoteEntry?.lockedDelta).toBe('-3000.00000000');

    // 2. Buyer ETH: +1 ETH available
    const buyerBaseEntry = entries.find((e) => e.accountId === accountIds.buyerBaseId);
    expect(buyerBaseEntry).toBeDefined();
    expect(buyerBaseEntry?.availableDelta).toBe('1.00000000');
    expect(buyerBaseEntry?.lockedDelta).toBe('0');

    // 3. Seller ETH: -1 ETH locked
    const sellerBaseEntry = entries.find((e) => e.accountId === accountIds.sellerBaseId);
    expect(sellerBaseEntry).toBeDefined();
    expect(sellerBaseEntry?.availableDelta).toBe('0');
    expect(sellerBaseEntry?.lockedDelta).toBe('-1.00000000');

    // 4. Seller USDT: +2800 USDT available
    const sellerQuoteEntry = entries.find((e) => e.accountId === accountIds.sellerQuoteId);
    expect(sellerQuoteEntry).toBeDefined();
    expect(sellerQuoteEntry?.availableDelta).toBe('2800.00000000');
    expect(sellerQuoteEntry?.lockedDelta).toBe('0');
  });
});
