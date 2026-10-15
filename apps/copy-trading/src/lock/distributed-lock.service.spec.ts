import { TimeUnit } from '@valkey/valkey-glide';
import { RedisService } from '../redis/redis.service';
import { DistributedLockService } from './distributed-lock.service';

describe('DistributedLockService (0 I/O Unit Tests)', () => {
  let lockService: DistributedLockService;
  let mockRedisClient: any;
  let mockRedisService: jest.Mocked<RedisService>;

  beforeEach(() => {
    mockRedisClient = {
      set: jest.fn(),
      customCommand: jest.fn(),
    };

    mockRedisService = {
      getClient: jest.fn().mockResolvedValue(mockRedisClient),
    } as any;

    lockService = new DistributedLockService(mockRedisService);
  });

  describe('acquireLock', () => {
    it('should acquire lock and return uuid token when Valkey returns OK', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      const token = await lockService.acquireLock('lock:copy:follower:123', 10000);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'lock:copy:follower:123',
        token,
        expect.objectContaining({
          conditionalSet: 'onlyIfDoesNotExist',
          expiry: { type: TimeUnit.Milliseconds, count: 10000 },
        }),
      );
    });

    it('should return null when key is already locked (SET returns null/nil)', async () => {
      mockRedisClient.set.mockResolvedValue(null);

      const token = await lockService.acquireLock('lock:copy:follower:123');

      expect(token).toBeNull();
    });

    it('should return null gracefully on redis client failure', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Connection timeout'));

      const token = await lockService.acquireLock('lock:copy:follower:123');

      expect(token).toBeNull();
    });
  });

  describe('releaseLock', () => {
    it('should release lock via EVAL Lua script and return true if owned', async () => {
      mockRedisClient.customCommand.mockResolvedValue(1);

      const result = await lockService.releaseLock('lock:copy:follower:123', 'my-token');

      expect(result).toBe(true);
      expect(mockRedisClient.customCommand).toHaveBeenCalledWith(
        expect.arrayContaining([
          'EVAL',
          expect.stringContaining('redis.call("get", KEYS[1])'),
          '1',
          'lock:copy:follower:123',
          'my-token',
        ]),
      );
    });

    it('should return false when lock is not owned or expired (EVAL returns 0)', async () => {
      mockRedisClient.customCommand.mockResolvedValue(0);

      const result = await lockService.releaseLock('lock:copy:follower:123', 'my-token');

      expect(result).toBe(false);
    });

    it('should return false gracefully on redis failure', async () => {
      mockRedisClient.customCommand.mockRejectedValue(new Error('Valkey failure'));

      const result = await lockService.releaseLock('lock:copy:follower:123', 'my-token');

      expect(result).toBe(false);
    });
  });
});
