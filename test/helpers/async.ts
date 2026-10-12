/**
 * @file async.ts
 * @description Asynchronous predicate polling utilities for reliable testing without hardcoded sleep delays.
 */

export interface WaitUntilOptions {
  /**
   * Maximum duration in milliseconds to wait before rejecting with a timeout error.
   * @default 5000
   */
  timeoutMs?: number;

  /**
   * Interval in milliseconds between predicate evaluations.
   * @default 100
   */
  intervalMs?: number;

  /**
   * Optional custom timeout message.
   */
  description?: string;
}

/**
 * Periodically invokes an action and evaluates the returned value against a predicate until it passes
 * or until the timeout is reached.
 *
 * @template T
 * @param action Function that produces a value or a Promise of a value.
 * @param predicate Predicate function that tests whether the produced value satisfies the expectation.
 * @param options Polling configuration (timeoutMs, intervalMs, description).
 * @returns Resolves with the matching value.
 */
export async function waitUntil<T>(
  action: () => Promise<T> | T,
  predicate: (value: T) => boolean | Promise<boolean>,
  options: WaitUntilOptions = {},
): Promise<T> {
  const { timeoutMs = 5000, intervalMs = 100, description } = options;
  const startTime = Date.now();

  let lastValue: T | undefined;
  let lastError: unknown;

  while (Date.now() - startTime < timeoutMs) {
    try {
      lastValue = await action();
      const isSatisfied = await predicate(lastValue);
      if (isSatisfied) {
        return lastValue;
      }
    } catch (err) {
      lastError = err;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const desc = description ? ` (${description})` : '';
  const errorDetails = lastError instanceof Error ? `: ${lastError.message}` : '';
  const valueDetails = lastValue !== undefined ? `, last value: ${JSON.stringify(lastValue)}` : '';

  throw new Error(`waitUntil timed out after ${timeoutMs}ms${desc}${errorDetails}${valueDetails}`);
}
