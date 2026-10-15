/**
 * Splits an array into discrete chunks of a specified size.
 */
export function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    throw new Error('Chunk size must be greater than 0');
  }
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }
  return result;
}

/**
 * Executes async tasks in discrete batches with an optional inter-batch hook (e.g. Kafka heartbeat).
 * Uses Promise.allSettled per batch for failure isolation.
 */
export async function executeInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  task: (item: T) => Promise<R>,
  onBatchComplete?: () => Promise<void>,
): Promise<PromiseSettledResult<R>[]> {
  const chunks = chunkArray(items, batchSize);
  const results: PromiseSettledResult<R>[] = [];

  for (const batch of chunks) {
    const batchResults = await Promise.allSettled(batch.map(task));
    results.push(...batchResults);
    if (onBatchComplete) {
      await onBatchComplete();
    }
  }

  return results;
}
