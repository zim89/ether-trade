/**
 * Supported trading and settlement currencies across the platform.
 */
export enum Currency {
  USDT = 'USDT',
  USDC = 'USDC',
  ETH = 'ETH',
  BTC = 'BTC',
}

/**
 * Currency metadata descriptor for precision, display, and type.
 */
export interface CurrencyMetadata {
  /** Symbol code matching the Currency enum */
  readonly symbol: Currency;
  /** Human-readable display name */
  readonly name: string;
  /** Maximum decimal places supported in balances and arithmetic */
  readonly decimals: number;
  /** Whether the asset is a fiat-pegged stablecoin */
  readonly isStablecoin: boolean;
}

/**
 * Currency configuration dictionary with extended metadata for each asset.
 */
export const CURRENCY_METADATA: Record<Currency, CurrencyMetadata> = {
  [Currency.USDT]: {
    symbol: Currency.USDT,
    name: 'Tether USD',
    decimals: 8,
    isStablecoin: true,
  },
  [Currency.USDC]: {
    symbol: Currency.USDC,
    name: 'USD Coin',
    decimals: 8,
    isStablecoin: true,
  },
  [Currency.ETH]: {
    symbol: Currency.ETH,
    name: 'Ethereum',
    decimals: 8,
    isStablecoin: false,
  },
  [Currency.BTC]: {
    symbol: Currency.BTC,
    name: 'Bitcoin',
    decimals: 8,
    isStablecoin: false,
  },
} as const;

/**
 * Default base settlement currency for new accounts and quotes.
 */
export const DEFAULT_CURRENCY = Currency.USDT;

/**
 * List of currently active supported currencies.
 */
export const SUPPORTED_CURRENCIES = Object.values(Currency) as readonly Currency[];
