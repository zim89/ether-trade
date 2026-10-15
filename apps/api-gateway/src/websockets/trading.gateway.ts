import { IncomingMessage } from 'http';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import { TelemetryMetricsService } from '@app/common/telemetry';
import {
  isValidChannel,
  WS_CHANNELS,
  WsClientAction,
  WsErrorMessage,
  WsOrderBookSnapshotMessage,
  WsOrderBookType,
} from '@app/contracts';
import type { WsClientMessage } from '@app/contracts';
import type { CurrentUserData } from '../common/decorators';
import type { GatewayConfig } from '../config/config.types';
import { OrdersService } from '../orders/orders.service';
import { RoomManagerService } from './room-manager.service';
import { ValkeyPubSubService } from './valkey-pubsub.service';
import { extractAndVerifyWsToken } from './ws-auth.helper';

export interface AuthenticatedWebSocket extends WebSocket {
  user?: CurrentUserData | null;
  isAlive?: boolean;
  messageCount?: number;
  windowReset?: number;
}

/**
 * High-performance WebSocket gateway handling market data feeds and private trading streams.
 */
@WebSocketGateway({ path: '/ws' })
export class TradingGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TradingGateway.name);
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly jwtSecret: string;

  constructor(
    private readonly roomManager: RoomManagerService,
    private readonly valkeyPubSub: ValkeyPubSubService,
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly telemetryMetrics: TelemetryMetricsService,
  ) {
    const gatewayCfg = this.configService.get<GatewayConfig>(CONFIG_NAMESPACES.gateway);
    this.jwtSecret = gatewayCfg?.jwtSecret ?? '';
  }

  afterInit(): void {
    // Bind Valkey Pub/Sub subscriber incoming messages directly to room broadcasts (Zero-Allocation Passthrough)
    this.valkeyPubSub.setMessageHandler((channel: string, message: string) => {
      this.roomManager.broadcastToRoom(channel, message);
    });

    // Start 30s heartbeat interval to detect stale connections and slow consumers
    this.heartbeatInterval = setInterval(() => {
      if (!this.server || !this.server.clients) return;

      for (const client of this.server.clients) {
        const ws = client as AuthenticatedWebSocket;
        if (ws.isAlive === false) {
          this.logger.debug('Heartbeat expired for WebSocket client, terminating connection');
          ws.terminate();
          continue;
        }

        ws.isAlive = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }
    }, 30000);

    this.logger.log('TradingGateway initialized with heartbeat and PubSub integration');
  }

  handleConnection(client: AuthenticatedWebSocket, req: IncomingMessage): void {
    client.isAlive = true;

    // Listen to pong responses
    client.on('pong', () => {
      client.isAlive = true;
    });

    // Perform handshake authentication
    const { user, selectedSubprotocol } = extractAndVerifyWsToken(
      req,
      this.jwtService,
      this.jwtSecret,
      this.logger,
    );

    client.user = user;
    if (selectedSubprotocol && !client.protocol) {
      (client as { protocol?: string }).protocol = selectedSubprotocol;
    }

    this.telemetryMetrics.wsActiveConnections?.add(1);

    if (user) {
      this.logger.debug(`WebSocket client connected: user=${user.userId} (${user.walletAddress})`);
    } else {
      this.logger.debug('WebSocket client connected: anonymous');
    }
  }

  handleDisconnect(client: AuthenticatedWebSocket): void {
    this.roomManager.removeClient(client);
    this.telemetryMetrics.wsActiveConnections?.add(-1);
    this.logger.debug(`WebSocket client disconnected (user=${client.user?.userId ?? 'anonymous'})`);
  }

  @SubscribeMessage(WsClientAction.PING)
  handlePing(@ConnectedSocket() client: AuthenticatedWebSocket): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
    }
  }

  private checkRateLimit(client: AuthenticatedWebSocket): boolean {
    const now = Date.now();
    if (!client.windowReset || now > client.windowReset) {
      client.windowReset = now + 1000;
      client.messageCount = 1;
      return true;
    }
    client.messageCount = (client.messageCount ?? 0) + 1;
    if (client.messageCount > 50) {
      this.sendError(client, 'Rate limit exceeded: max 50 requests per second', 'WS_RATE_LIMITED');
      return false;
    }
    return true;
  }

  @SubscribeMessage(WsClientAction.SUBSCRIBE)
  async handleSubscribe(
    @ConnectedSocket() client: AuthenticatedWebSocket,
    @MessageBody() payload: WsClientMessage,
  ): Promise<void> {
    if (!this.checkRateLimit(client)) {
      return;
    }

    const channel = payload?.channel;

    if (!channel || !isValidChannel(channel)) {
      this.sendError(client, `Invalid or unsupported channel: ${channel}`);
      return;
    }

    // Check private channels authorization
    if (channel === WS_CHANNELS.userOrders || channel === WS_CHANNELS.userTransfers) {
      if (!client.user) {
        this.sendError(
          client,
          'Unauthorized: authentication required for private user stream',
          'WS_UNAUTHORIZED',
        );
        return;
      }

      const subTopic = channel === WS_CHANNELS.userOrders ? 'orders' : 'transfers';
      const isolatedRoom = this.roomManager.getUserPrivateRoom(client.user.userId, subTopic);
      this.roomManager.join(client, isolatedRoom);

      this.sendAck(client, 'subscribed', channel);
      return;
    }

    // Public channels (orderbook:<symbol> or trades:<symbol>)
    this.roomManager.join(client, channel);
    this.sendAck(client, 'subscribed', channel);

    // If orderbook subscription, immediately dispatch snapshot
    if (channel.startsWith('orderbook:')) {
      const symbol = channel.split(':')[1];
      await this.sendOrderBookSnapshot(client, channel, symbol);
    }
  }

  @SubscribeMessage(WsClientAction.UNSUBSCRIBE)
  handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedWebSocket,
    @MessageBody() payload: WsClientMessage,
  ): void {
    if (!this.checkRateLimit(client)) {
      return;
    }

    const channel = payload?.channel;

    if (!channel || !isValidChannel(channel)) {
      this.sendError(client, `Invalid or unsupported channel: ${channel}`);
      return;
    }

    if (channel === WS_CHANNELS.userOrders || channel === WS_CHANNELS.userTransfers) {
      if (client.user) {
        const subTopic = channel === WS_CHANNELS.userOrders ? 'orders' : 'transfers';
        const isolatedRoom = this.roomManager.getUserPrivateRoom(client.user.userId, subTopic);
        this.roomManager.leave(client, isolatedRoom);
      }
      this.sendAck(client, 'unsubscribed', channel);
      return;
    }

    this.roomManager.leave(client, channel);
    this.sendAck(client, 'unsubscribed', channel);
  }

  private async sendOrderBookSnapshot(
    client: AuthenticatedWebSocket,
    channel: string,
    symbol: string,
  ): Promise<void> {
    try {
      const depthResponse = await this.ordersService.getOrderBook(symbol, { depth: 50 });

      const snapshotMessage: WsOrderBookSnapshotMessage = {
        channel,
        type: WsOrderBookType.SNAPSHOT,
        sequenceId: depthResponse.sequenceId,
        bids: depthResponse.bids.map((b) => [b.price, b.amount]),
        asks: depthResponse.asks.map((a) => [a.price, a.amount]),
        timestamp: depthResponse.timestamp,
      };

      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(snapshotMessage));
      }
    } catch (err: unknown) {
      this.logger.error(
        `Failed to fetch orderbook snapshot for ${symbol}: ${(err as Error).message}`,
      );
      this.sendError(client, `Failed to fetch snapshot for ${symbol}`);
    }
  }

  private sendError(
    this: void,
    client: AuthenticatedWebSocket,
    message: string,
    code?: string | number,
  ): void {
    if (client.readyState === WebSocket.OPEN) {
      const errorMsg: WsErrorMessage = {
        event: 'error',
        message,
        code,
        timestamp: Date.now(),
      };
      client.send(JSON.stringify(errorMsg));
    }
  }

  private sendAck(
    this: void,
    client: AuthenticatedWebSocket,
    action: string,
    channel: string,
  ): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event: action, channel, timestamp: Date.now() }));
    }
  }

  onModuleDestroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
