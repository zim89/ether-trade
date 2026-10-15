import { chunkArray, executeInBatches } from './async.utils';

describe('async.utils (0 I/O Unit Tests)', () => {
  describe('chunkArray', () => {
    it('should split array into discrete chunks of given size', () => {
      const items = [1, 2, 3, 4, 5, 6, 7];
      const chunks = chunkArray(items, 3);

      expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    });

    it('should return single chunk if size >= items.length', () => {
      const items = ['a', 'b'];
      const chunks = chunkArray(items, 5);

      expect(chunks).toEqual([['a', 'b']]);
    });

    it('should return empty array for empty items', () => {
      expect(chunkArray([], 10)).toEqual([]);
    });

    it('should throw error for non-positive chunk size', () => {
      expect(() => chunkArray([1, 2], 0)).toThrow('Chunk size must be greater than 0');
      expect(() => chunkArray([1, 2], -1)).toThrow('Chunk size must be greater than 0');
    });
  });

  describe('executeInBatches', () => {
    it('should execute tasks in batches and invoke onBatchComplete hook between batches', async () => {
      const items = [10, 20, 30, 40, 50];
      const task = jest.fn((n: number) => Promise.resolve(n * 2));
      const onBatchComplete = jest.fn(() => Promise.resolve());

      const results = await executeInBatches(items, 2, task, onBatchComplete);

      expect(results).toHaveLength(5);
      expect(results[0]).toEqual({ status: 'fulfilled', value: 20 });
      expect(results[4]).toEqual({ status: 'fulfilled', value: 100 });
      // 3 batches total ([10,20], [30,40], [50]) -> 3 batch hook calls
      expect(onBatchComplete).toHaveBeenCalledTimes(3);
    });

    it('should isolate failures without rejecting entire batch (Promise.allSettled)', async () => {
      const items = [1, 2, 3];
      const task = jest.fn((n: number) => {
        if (n === 2) {
          return Promise.reject(new Error('Item 2 failed'));
        }
        return Promise.resolve(n * 10);
      });

      const results = await executeInBatches(items, 2, task);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
    });
  });
});
