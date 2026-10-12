import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GlideClient } from '@valkey/valkey-glide';
import { COMMON_ERRORS, COMMON_LOGS, CONFIG_NAMESPACES } from '@app/common/constants';
import { OrdersAppConfig } from '../config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: GlideClient | null = null;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService<OrdersAppConfig, true>) {}

  async onModuleInit(): Promise<void> {
    await this.initClient();
  }

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

  async getClient(): Promise<GlideClient> {
    if (!this.client) {
      await this.initClient();
    }
    if (!this.client) {
      throw new Error(COMMON_ERRORS.redis.connectionFailed);
    }
    return this.client;
  }

  onModuleDestroy(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
}
