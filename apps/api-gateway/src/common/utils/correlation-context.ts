import { AsyncLocalStorage } from 'node:async_hooks';

type CorrelationStore = {
  correlationId: string;
};

const correlationStorage = new AsyncLocalStorage<CorrelationStore>();

/**
 * Runs the rest of the HTTP pipeline inside a correlation AsyncLocalStorage context.
 */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return correlationStorage.run({ correlationId }, fn);
}

/**
 * Returns the correlation id for the current async HTTP context, if any.
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}
