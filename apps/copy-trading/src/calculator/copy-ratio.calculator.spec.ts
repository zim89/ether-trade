import { CopyRatioCalculator } from './copy-ratio.calculator';

describe('CopyRatioCalculator (0 I/O Unit Tests)', () => {
  let calculator: CopyRatioCalculator;

  beforeEach(() => {
    calculator = new CopyRatioCalculator();
  });

  describe('calculateBuyQuantity', () => {
    it('should correctly calculate proportional follower BUY quantity with ROUND_DOWN', () => {
      // Master balance: 10 000 USDT. Order: 1.0 ETH (2500 USDT, 25% of master deposit)
      // Follower allocated: 500 USDT
      // Expected follower order: 1.0 * (500 / 10000) = 0.05 ETH
      const result = calculator.calculateBuyQuantity({
        masterOrderQuantity: '1.00000000',
        masterAvailableUsdt: '10000.00000000',
        followerAllocatedUsdt: '500.00000000',
      });

      expect(result).toBe('0.05000000');
    });

    it('should handle fractional recurring decimals safely with ROUND_DOWN truncation', () => {
      // 1 / 3 = 0.33333333...
      const result = calculator.calculateBuyQuantity({
        masterOrderQuantity: '1.00000000',
        masterAvailableUsdt: '300.00000000',
        followerAllocatedUsdt: '100.00000000',
      });

      expect(result).toBe('0.33333333');
    });

    it('should return 0.00000000 when master or follower balance is zero or negative', () => {
      expect(
        calculator.calculateBuyQuantity({
          masterOrderQuantity: '1.00000000',
          masterAvailableUsdt: '0.00000000',
          followerAllocatedUsdt: '500.00000000',
        }),
      ).toBe('0.00000000');

      expect(
        calculator.calculateBuyQuantity({
          masterOrderQuantity: '1.00000000',
          masterAvailableUsdt: '10000.00000000',
          followerAllocatedUsdt: '0.00000000',
        }),
      ).toBe('0.00000000');

      expect(
        calculator.calculateBuyQuantity({
          masterOrderQuantity: '0.00000000',
          masterAvailableUsdt: '10000.00000000',
          followerAllocatedUsdt: '500.00000000',
        }),
      ).toBe('0.00000000');
    });
  });

  describe('calculateSellQuantity', () => {
    it('should calculate proportional SELL quantity based on follower subscription position', () => {
      // Master sells 0.5 ETH out of total 1.0 ETH holding (50%)
      // Follower has accumulated 0.05 ETH position in subscription
      // Expected follower sell: 0.05 * (0.5 / 1.0) = 0.025 ETH
      const result = calculator.calculateSellQuantity({
        masterSellQuantity: '0.50000000',
        masterTotalBaseAsset: '1.00000000',
        followerSubPosition: '0.05000000',
      });

      expect(result).toBe('0.02500000');
    });

    it('should return 0.00000000 when followerSubPosition <= 0 (subscribed during open position)', () => {
      const result = calculator.calculateSellQuantity({
        masterSellQuantity: '0.50000000',
        masterTotalBaseAsset: '1.00000000',
        followerSubPosition: '0.00000000',
      });

      expect(result).toBe('0.00000000');
    });

    it('should cap follower sell quantity at followerSubPosition to prevent overselling', () => {
      // If due to any rounding ratio exceeds 1, never sell more than sub position
      const result = calculator.calculateSellQuantity({
        masterSellQuantity: '2.00000000',
        masterTotalBaseAsset: '1.00000000',
        followerSubPosition: '0.05000000',
      });

      expect(result).toBe('0.05000000');
    });
  });

  describe('calculateSubPosition', () => {
    it('should correctly sum buy and sell totals to get net position', () => {
      const pos = calculator.calculateSubPosition('1.50000000', '0.50000000');
      expect(pos).toBe('1.00000000');
    });

    it('should return 0.00000000 when sell exceeds or equals buy', () => {
      expect(calculator.calculateSubPosition('0.50000000', '0.50000000')).toBe('0.00000000');
      expect(calculator.calculateSubPosition('0.50000000', '1.00000000')).toBe('0.00000000');
    });
  });
});
