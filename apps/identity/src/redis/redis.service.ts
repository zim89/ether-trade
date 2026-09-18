import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GlideClient, TimeUnit } from '@valkey/valkey-glide';
import { COMMON_ERRORS, COMMON_LOGS, CONFIG_NAMESPACES } from '@app/common/constants';
import { AppConfig } from '../config';

/**
 * Service managing In-Memory Redis/Valkey cache and operations:
 * - Connection lifecycle via high-performance Valkey GLIDE driver.
 * - Atomic SIWE nonce caching and single-use retrieval via GETDEL (Replay Attack prevention).
 * - General-purpose key-value caching with optional TTL.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: GlideClient | null = null;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async onModuleInit(): Promise<void> {
    await this.initClient();
  }

  /**
   * Initializes the Redis/Valkey GLIDE client connection.
   */
  private async initClient(): Promise<void> {
    const redisConf = this.configService.getOrThrow(CONFIG_NAMESPACES.redis, { infer: true });
    const host = redisConf.host;
    const port = redisConf.port;
    const password = redisConf.password;

    try {
      this.client = await GlideClient.createClient({
        addresses: [{ host, port }],
        credentials: password ? { password } : undefined,
        requestTimeout: 2000,
      });

      this.logger.log(COMMON_LOGS.redis.connected(host, port));
    } catch (err: unknown) {
      this.logger.error(COMMON_LOGS.redis.connectionError((err as Error).message));
    }
  }

  /**
   * Retrieves the connected GlideClient instance (reconnects if disconnected).
   */
  async getClient(): Promise<GlideClient> {
    if (!this.client) {
      await this.initClient();
    }
    if (!this.client) {
      throw new Error(COMMON_ERRORS.redis.connectionFailed);
    }
    return this.client;
  }

  /**
   * Stores a SIWE nonce with a Time-To-Live.
   *
   * @param walletAddress - Raw or checksummed EVM address (lowercased in key)
   * @param nonce - Cryptographic alphanumeric nonce string
   * @param ttlSeconds - Time-to-live in seconds (default: 300 / 5 minutes)
   */
  async setNonce(walletAddress: string, nonce: string, ttlSeconds = 300): Promise<void> {
    const client = await this.getClient();
    const key = `siwe:nonce:${walletAddress.toLowerCase()}`;

    await client.set(key, nonce, {
      expiry: {
        type: TimeUnit.Seconds,
        count: ttlSeconds,
      },
    });
  }

  /**
   * Atomically reads and deletes a SIWE nonce via Redis `GETDEL` (Replay Attack protection).
   *
   * @param walletAddress - EVM address used to construct cache key
   * @returns The stored nonce string, or `null` if expired or not found
   */
  async getAndDelNonce(walletAddress: string): Promise<string | null> {
    const client = await this.getClient();
    const key = `siwe:nonce:${walletAddress.toLowerCase()}`;

    const nonce = await client.getdel(key);
    return typeof nonce === 'string' ? nonce : null;
  }

  /**
   * Retrieves a cached string value by key.
   *
   * @param key - Namespaced cache key (e.g. `nonce:0x...`)
   */
  async get(key: string): Promise<string | null> {
    const client = await this.getClient();
    const value = await client.get(key);
    return typeof value === 'string' ? value : null;
  }

  /**
   * Sets a key-value pair with optional TTL.
   *
   * @param key - Namespaced cache key
   * @param value - Stringified payload or value
   * @param ttlSeconds - Expiration duration in seconds (optional)
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = await this.getClient();

    if (ttlSeconds) {
      await client.set(key, value, {
        expiry: {
          type: TimeUnit.Seconds,
          count: ttlSeconds,
        },
      });
    } else {
      await client.set(key, value);
    }
  }

  /**
   * Deletes a cached key.
   *
   * @param key - Namespaced cache key to invalidate
   */
  async del(key: string): Promise<void> {
    const client = await this.getClient();
    await client.del([key]);
  }

  /**
   * Lifecycle hook executed on application shutdown.
   * Gracefully terminates the connection.
   */
  onModuleDestroy(): void {
    if (this.client) {
      this.logger.log(COMMON_LOGS.redis.closingConnection);
      this.client.close();
    }
  }
}
