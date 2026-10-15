import { IncomingMessage } from 'http';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocket } from 'ws';
import { UserRole } from '@app/common/constants';
import { WsClientAction, WS_CHANNELS } from '@app/contracts';
import { OrdersService } from '../orders/orders.service';
import { RoomManagerService } from './room-manager.service';
import { AuthenticatedWebSocket, TradingGateway } from './trading.gateway';
import { ValkeyPubSubService } from './valkey-pubsub.service';

describe('TradingGateway', () => {
  let gateway: TradingGateway;

  let joinMock: jest.Mock;
  let leaveMock: jest.Mock;
  let removeClientMock: jest.Mock;
  let broadcastToRoomMock: jest.Mock;
  let getUserPrivateRoomMock: jest.Mock;
  let setMessageHandlerMock: jest.Mock;
  let getOrderBookMock: jest.Mock;

  let roomManager: RoomManagerService;
  let valkeyPubSub: ValkeyPubSubService;
  let ordersService: OrdersService;
  let configService: ConfigService;
  let jwtService: JwtService;

  const jwtSecret = 'gateway-secret-test';

  beforeEach(() => {
    jwtService = new JwtService();

    joinMock = jest.fn();
    leaveMock = jest.fn();
    removeClientMock = jest.fn();
    broadcastToRoomMock = jest.fn();
    getUserPrivateRoomMock = jest.fn((userId: string, topic: string) => `user:${userId}:${topic}`);
    setMessageHandlerMock = jest.fn();
    getOrderBookMock = jest.fn().mockResolvedValue({
      pair: 'ETH_USDT',
      bids: [{ price: '3000', amount: '2' }],
      asks: [{ price: '3001', amount: '1' }],
      timestamp: 12345678,
      sequenceId: 10,
    });

    roomManager = {
      join: joinMock,
      leave: leaveMock,
      removeClient: removeClientMock,
      broadcastToRoom: broadcastToRoomMock,
      getUserPrivateRoom: getUserPrivateRoomMock,
    } as unknown as RoomManagerService;

    valkeyPubSub = {
      setMessageHandler: setMessageHandlerMock,
    } as unknown as ValkeyPubSubService;

    ordersService = {
      getOrderBook: getOrderBookMock,
    } as unknown as OrdersService;

    configService = {
      get: jest.fn().mockReturnValue({ jwtSecret }),
    } as unknown as ConfigService;

    gateway = new TradingGateway(
      roomManager,
      valkeyPubSub,
      ordersService,
      configService,
      jwtService,
    );
  });

  afterEach(() => {
    gateway.onModuleDestroy();
  });

  describe('handleConnection & Handshake Auth', () => {
    it('should authenticate client with valid JWT in query', () => {
      const token = jwtService.sign(
        { sub: 'usr-42', walletAddress: '0xabc', role: UserRole.TRADER },
        { secret: jwtSecret },
      );

      const client = {
        isAlive: false,
        on: jest.fn(),
      } as unknown as AuthenticatedWebSocket;

      const req = {
        headers: {},
        url: `/ws?token=${token}`,
      } as unknown as IncomingMessage;

      gateway.handleConnection(client, req);

      expect(client.isAlive).toBe(true);
      expect(client.user).toEqual({
        userId: 'usr-42',
        walletAddress: '0xabc',
        role: UserRole.TRADER,
      });
    });

    it('should set anonymous user if token is missing', () => {
      const client = {
        isAlive: false,
        on: jest.fn(),
      } as unknown as AuthenticatedWebSocket;

      const req = {
        headers: {},
        url: '/ws',
      } as unknown as IncomingMessage;

      gateway.handleConnection(client, req);

      expect(client.isAlive).toBe(true);
      expect(client.user).toBeNull();
    });
  });

  describe('handleSubscribe & Snapshot delivery', () => {
    it('should subscribe to public orderbook and dispatch snapshot with sequenceId', async () => {
      const sendMock = jest.fn<void, [string]>();
      const client = {
        readyState: WebSocket.OPEN,
        send: sendMock,
      } as unknown as AuthenticatedWebSocket;

      await gateway.handleSubscribe(client, {
        action: WsClientAction.SUBSCRIBE,
        channel: 'orderbook:ETH_USDT',
      });

      expect(joinMock).toHaveBeenCalledWith(client, 'orderbook:ETH_USDT');
      expect(getOrderBookMock).toHaveBeenCalledWith('ETH_USDT', { depth: 50 });

      // First call is subscription ack, second is snapshot
      expect(sendMock).toHaveBeenCalledTimes(2);

      const ack = JSON.parse(sendMock.mock.calls[0][0]) as {
        event: string;
        channel: string;
      };
      expect(ack.event).toBe('subscribed');
      expect(ack.channel).toBe('orderbook:ETH_USDT');

      const snapshot = JSON.parse(sendMock.mock.calls[1][0]) as {
        type: string;
        sequenceId: number;
        bids: [string, string][];
      };
      expect(snapshot.type).toBe('snapshot');
      expect(snapshot.sequenceId).toBe(10);
      expect(snapshot.bids).toEqual([['3000', '2']]);
    });

    it('should isolate private user room for authenticated user', async () => {
      const sendMock = jest.fn<void, [string]>();
      const client = {
        readyState: WebSocket.OPEN,
        send: sendMock,
        user: { userId: 'usr-123', walletAddress: '0x123', role: UserRole.TRADER },
      } as unknown as AuthenticatedWebSocket;

      await gateway.handleSubscribe(client, {
        action: WsClientAction.SUBSCRIBE,
        channel: WS_CHANNELS.userOrders,
      });

      expect(getUserPrivateRoomMock).toHaveBeenCalledWith('usr-123', 'orders');
      expect(joinMock).toHaveBeenCalledWith(client, 'user:usr-123:orders');

      const ack = JSON.parse(sendMock.mock.calls[0][0]) as {
        event: string;
        channel: string;
      };
      expect(ack.event).toBe('subscribed');
      expect(ack.channel).toBe(WS_CHANNELS.userOrders);
    });

    it('should reject private channel subscription for anonymous user', async () => {
      const sendMock = jest.fn<void, [string]>();
      const client = {
        readyState: WebSocket.OPEN,
        send: sendMock,
        user: null,
      } as unknown as AuthenticatedWebSocket;

      await gateway.handleSubscribe(client, {
        action: WsClientAction.SUBSCRIBE,
        channel: WS_CHANNELS.userOrders,
      });

      expect(joinMock).not.toHaveBeenCalled();
      const err = JSON.parse(sendMock.mock.calls[0][0]) as {
        event: string;
        code: string;
      };
      expect(err.event).toBe('error');
      expect(err.code).toBe('WS_UNAUTHORIZED');
    });
  });

  describe('handleDisconnect', () => {
    it('should remove client from room manager', () => {
      const client = {} as AuthenticatedWebSocket;
      gateway.handleDisconnect(client);
      expect(removeClientMock).toHaveBeenCalledWith(client);
    });
  });
});
