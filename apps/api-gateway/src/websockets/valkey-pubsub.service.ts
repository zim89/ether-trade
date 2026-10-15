import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GlideClient, GlideClientConfiguration, PubSubMsg } from '@valkey/valkey-glide';
import { COMMON_ERRORS, COMMON_LOGS } from '@app/common/constants';
import { GatewayConfig } from '../config/config.types';

export type PubSubMessageHandler = (
  channel: string,
  message: string,
  pattern?: string | null,
) => void;

/**
 * ValkeyPubSubService
 *
 * Provides a dual-instance Valkey GLIDE Pub/Sub adapter:
 *  - Publisher: dedicated GlideClient instance for publishing messages to channels
 *  - Subscriber: dedicated GlideClient instance configured with glob patterns
 *    ('orderbook:*', 'trades:*', 'user:*') and a message callback
 */
@Injectable()
export class ValkeyPubSubService implements OnModuleInit, OnModuleDestroy {
  private publisher: GlideClient | null = null;
  private subscriber: GlideClient | null = null;
  private readonly logger = new Logger(ValkeyPubSubService.name);
  private messageHandler: PubSubMessageHandler | null = null;

  constructor(private readonly configService: ConfigService<GatewayConfig, true>) {}

  async onModuleInit(): Promise<void> {
    await this.initClients();
  }

  /**
   * Sets the subscriber incoming message handler callback.
   */
  setMessageHandler(handler: PubSubMessageHandler): void {
    this.messageHandler = handler;
  }

  private async initClients(): Promise<void> {
    const host = this.configService.get('redisHost', { infer: true });
    const port = this.configService.get('redisPort', { infer: true });
    const password = this.configService.get('redisPassword', { infer: true });

    try {
      // 1. Dedicated Publisher Client
      this.publisher = await GlideClient.createClient({
        addresses: [{ host, port }],
        credentials: password ? { password } : undefined,
        requestTimeout: 2000,
      });

      // 2. Dedicated Subscriber Client with channel patterns
      const subscriberConfig: GlideClientConfiguration = {
        addresses: [{ host, port }],
        credentials: password ? { password } : undefined,
        requestTimeout: 2000,
        pubsubSubscriptions: {
          channelsAndPatterns: {
            [GlideClientConfiguration.PubSubChannelModes.Pattern]: new Set([
              'orderbook:*',
              'trades:*',
              'user:*',
            ]),
          },
          callback: (msg: PubSubMsg) => {
            this.onPubSubMessage(msg);
          },
        },
      };

      this.subscriber = await GlideClient.createClient(subscriberConfig);

      this.logger.log(
        `Valkey GLIDE Pub/Sub initialized successfully on ${host}:${port} (Publisher & Subscriber)`,
      );
    } catch (err: unknown) {
      this.logger.error(COMMON_LOGS.redis.connectionError((err as Error).message));
    }
  }

  private onPubSubMessage(msg: PubSubMsg): void {
    const channel =
      typeof msg.channel === 'string' ? msg.channel : (msg.channel?.toString?.() ?? '');
    const message =
      typeof msg.message === 'string' ? msg.message : (msg.message?.toString?.() ?? '');
    const pattern = msg.pattern
      ? typeof msg.pattern === 'string'
        ? msg.pattern
        : msg.pattern?.toString?.()
      : null;

    if (this.messageHandler) {
      try {
        this.messageHandler(channel, message, pattern);
      } catch (err: unknown) {
        this.logger.error(
          `Error in Pub/Sub message handler for channel ${channel}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Publishes a raw message payload to a specified channel.
   */
  async publish(channel: string, message: string): Promise<number> {
    const pub = await this.getPublisher();
    return Number(await pub.publish(message, channel));
  }

  async getPublisher(): Promise<GlideClient> {
    if (!this.publisher) {
      await this.initClients();
    }
    if (!this.publisher) {
      throw new Error(COMMON_ERRORS.redis.connectionFailed);
    }
    return this.publisher;
  }

  async getSubscriber(): Promise<GlideClient> {
    if (!this.subscriber) {
      await this.initClients();
    }
    if (!this.subscriber) {
      throw new Error(COMMON_ERRORS.redis.connectionFailed);
    }
    return this.subscriber;
  }

  onModuleDestroy(): void {
    if (this.publisher) {
      this.publisher.close();
      this.publisher = null;
    }
    if (this.subscriber) {
      this.subscriber.close();
      this.subscriber = null;
    }
  }
}
