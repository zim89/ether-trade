import BigNumber from 'bignumber.js';

export const PLATFORM_DECIMALS = 8;
export const MIN_DEPOSIT_THRESHOLD = new BigNumber('0.00000001');

BigNumber.config({ DECIMAL_PLACES: PLATFORM_DECIMALS, ROUNDING_MODE: BigNumber.ROUND_DOWN });

/**
 * Scales an EVM on-chain integer (e.g. 18 decimals for ETH, 6 decimals for USDT)
 * to platform decimal format `numeric(28, 8)` with truncation of dust.
 */
export function scaleEvmAmountToPlatform(evmAmount: bigint, tokenDecimals: number): string {
  const rawString = evmAmount.toString();
  const divisor = new BigNumber(10).pow(tokenDecimals);
  const scaled = new BigNumber(rawString).dividedBy(divisor);

  const truncated = scaled.toFixed(PLATFORM_DECIMALS, BigNumber.ROUND_DOWN);
  return truncated;
}

/**
 * Checks if the scaled amount meets the minimum platform deposit threshold (0.00000001).
 */
export function isAboveMinDepositThreshold(amount: string): boolean {
  return new BigNumber(amount).gte(MIN_DEPOSIT_THRESHOLD);
}

/**
 * Converts a platform 8-decimal string (e.g. "1.50000000") to exact EVM integer wei (bigint)
 * based on the target token decimals (e.g. 18 for ETH, 6 for USDT).
 */
export function scalePlatformAmountToEvm(platformAmount: string, tokenDecimals: number): bigint {
  const multiplier = new BigNumber(10).pow(tokenDecimals);
  const evmUnits = new BigNumber(platformAmount).multipliedBy(multiplier);

  return BigInt(evmUnits.toFixed(0, BigNumber.ROUND_DOWN));
}
