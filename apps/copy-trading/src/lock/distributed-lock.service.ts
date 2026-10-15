import { Injectable, Logger } from '@nestjs/common';
import { TimeUnit } from '@valkey/valkey-glide';
import { v7 as uuidv7 } from 'uuid';
import { TelemetryMetricsService } from '@app/common/telemetry';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly telemetryMetrics: TelemetryMetricsService,
  ) {}

  /**
   * Acquire a distributed lock for a follower with safe default TTL 10 000 ms.
   * Prevents concurrent order overlap and margin overdraft.
   */
  async acquireLock(key: string, ttlMs = 10000): Promise<string | null> {
    const start = process.hrtime.bigint();
    let acquired = false;
    try {
      const lockToken = uuidv7();
      const client = await this.redisService.getClient();

      // SET <key> <token> NX PX <ttlMs>
      const result = await client.set(key, lockToken, {
        conditionalSet: 'onlyIfDoesNotExist',
        expiry: { type: TimeUnit.Milliseconds, count: ttlMs },
      });

      acquired = result === 'OK';
      return acquired ? lockToken : null;
    } catch (err: unknown) {
      this.logger.error(`Failed to acquire lock for key ${key}: ${(err as Error).message}`);
      return null;
    } finally {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      this.telemetryMetrics.lockAcquisitionDurationMs?.record(durationMs, {
        success: String(acquired),
      });
    }
  }

  /**
   * Atomically release the lock only by its owner (matching issued token) using Lua script.
   */
  async releaseLock(key: string, lockToken: string): Promise<boolean> {
    try {
      const client = await this.redisService.getClient();
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const res = await client.customCommand(['EVAL', luaScript, '1', key, lockToken]);

      return res === 1;
    } catch (err: unknown) {
      this.logger.error(`Failed to release lock for key ${key}: ${(err as Error).message}`);
      return false;
    }
  }
}
