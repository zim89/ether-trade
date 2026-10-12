import {
  scaleEvmAmountToPlatform,
  isAboveMinDepositThreshold,
  scalePlatformAmountToEvm,
} from './unit-converter';

describe('UnitConverter', () => {
  describe('scaleEvmAmountToPlatform', () => {
    it('should correctly scale 18 decimals ETH (1 ETH = 10^18 wei) to 8 decimals', () => {
      const oneEthInWei = 1_000_000_000_000_000_000n;
      const result = scaleEvmAmountToPlatform(oneEthInWei, 18);
      expect(result).toBe('1.00000000');
    });

    it('should correctly scale 6 decimals USDT (100 USDT = 100 * 10^6) to 8 decimals', () => {
      const hundredUsdtInUnits = 100_000_000n;
      const result = scaleEvmAmountToPlatform(hundredUsdtInUnits, 6);
      expect(result).toBe('100.00000000');
    });

    it('should truncate dust beyond 8 decimals without rounding up', () => {
      // 0.123456789 ETH in wei = 123456789000000000n
      const amountWithDust = 123456789000000000n;
      const result = scaleEvmAmountToPlatform(amountWithDust, 18);
      expect(result).toBe('0.12345678');
    });

    it('should return 0.00000000 for sub-dust wei amount (< 10^10 wei in 18 decimals)', () => {
      const subDustWei = 9_999_999_999n;
      const result = scaleEvmAmountToPlatform(subDustWei, 18);
      expect(result).toBe('0.00000000');
    });

    it('should correctly scale 0 wei', () => {
      const result = scaleEvmAmountToPlatform(0n, 18);
      expect(result).toBe('0.00000000');
    });

    it('should handle large amounts exceeding standard integer boundaries without precision loss', () => {
      // 10,000,000 ETH in wei
      const largeWei = 10_000_000n * 1_000_000_000_000_000_000n;
      const result = scaleEvmAmountToPlatform(largeWei, 18);
      expect(result).toBe('10000000.00000000');
    });
  });

  describe('isAboveMinDepositThreshold', () => {
    it('should return true when amount is exactly minimum deposit threshold (0.00000001)', () => {
      expect(isAboveMinDepositThreshold('0.00000001')).toBe(true);
    });

    it('should return true when amount is greater than threshold', () => {
      expect(isAboveMinDepositThreshold('0.00000002')).toBe(true);
      expect(isAboveMinDepositThreshold('1.00000000')).toBe(true);
    });

    it('should return false when amount is zero or dust', () => {
      expect(isAboveMinDepositThreshold('0.00000000')).toBe(false);
      expect(isAboveMinDepositThreshold('0')).toBe(false);
    });
  });

  describe('scalePlatformAmountToEvm', () => {
    it('should correctly convert 1.00000000 ETH to 10^18 wei', () => {
      const result = scalePlatformAmountToEvm('1.00000000', 18);
      expect(result).toBe(1_000_000_000_000_000_000n);
    });

    it('should correctly convert 100.50000000 USDT to 6 decimals units', () => {
      const result = scalePlatformAmountToEvm('100.50000000', 6);
      expect(result).toBe(100_500_000n);
    });

    it('should truncate precision when token decimals (6) is smaller than platform decimals (8)', () => {
      // 0.00000001 USDT has 8 decimals, but USDT token only supports 6 decimals -> truncates to 0
      const result = scalePlatformAmountToEvm('0.00000001', 6);
      expect(result).toBe(0n);

      // 0.00000100 USDT matches 6 decimals = 1 unit
      const oneUnitResult = scalePlatformAmountToEvm('0.00000100', 6);
      expect(oneUnitResult).toBe(1n);
    });

    it('should handle zero platform amount', () => {
      const result = scalePlatformAmountToEvm('0.00000000', 18);
      expect(result).toBe(0n);
    });
  });

  describe('Round-trip symmetry (for compatible precisions)', () => {
    it('should satisfy scalePlatformAmountToEvm(scaleEvmAmountToPlatform(wei)) == wei for 8-decimal aligned values', () => {
      const originalWei = 1_23456789_0000000000n; // 1.23456789 ETH
      const platform = scaleEvmAmountToPlatform(originalWei, 18);
      expect(platform).toBe('1.23456789');
      const reconvertedWei = scalePlatformAmountToEvm(platform, 18);
      expect(reconvertedWei).toBe(originalWei);
    });
  });
});
