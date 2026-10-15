import { RiskGuardService } from './risk-guard.service';

describe('RiskGuardService (0 I/O Unit Tests)', () => {
  let riskGuard: RiskGuardService;

  beforeEach(() => {
    riskGuard = new RiskGuardService();
  });

  describe('calculateProtectedPrice', () => {
    it('should add slippage for BUY orders and round up (ceiling protection)', () => {
      // 2500 USDT with 1% slippage -> 2525 USDT
      const price = riskGuard.calculateProtectedPrice({
        masterPrice: '2500.00000000',
        maxSlippagePercent: '1.00',
        side: 'BUY',
      });

      expect(price).toBe('2525.00000000');
    });

    it('should subtract slippage for SELL orders and round down (floor protection)', () => {
      // 2500 USDT with 1% slippage -> 2475 USDT
      const price = riskGuard.calculateProtectedPrice({
        masterPrice: '2500.00000000',
        maxSlippagePercent: '1.00',
        side: 'SELL',
      });

      expect(price).toBe('2475.00000000');
    });

    it('should handle small fractional slippage correctly', () => {
      const price = riskGuard.calculateProtectedPrice({
        masterPrice: '100.00000000',
        maxSlippagePercent: '0.50',
        side: 'BUY',
      });

      expect(price).toBe('100.50000000');
    });
  });

  describe('checkMinLot (Dust Protection)', () => {
    it('should identify dust when quantity is below minLot for pair', () => {
      // ETH_USDT minLot is 0.00100000
      const check = riskGuard.checkMinLot('ETH_USDT', '0.00050000');
      expect(check.isDust).toBe(true);
      expect(check.minLot).toBe('0.00100000');
    });

    it('should pass valid quantities at or above minLot', () => {
      const checkEqual = riskGuard.checkMinLot('ETH_USDT', '0.00100000');
      expect(checkEqual.isDust).toBe(false);

      const checkAbove = riskGuard.checkMinLot('ETH_USDT', '0.05000000');
      expect(checkAbove.isDust).toBe(false);
    });

    it('should flag zero or negative quantities as dust', () => {
      expect(riskGuard.checkMinLot('BTC_USDT', '0.00000000').isDust).toBe(true);
      expect(riskGuard.checkMinLot('BTC_USDT', '-1.00000000').isDust).toBe(true);
    });
  });
});
