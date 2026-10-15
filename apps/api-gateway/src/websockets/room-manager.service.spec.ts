import { WebSocket } from 'ws';
import { MAX_WS_BUFFER_SIZE_BYTES, RoomManagerService } from './room-manager.service';

describe('RoomManagerService', () => {
  let service: RoomManagerService;
  let mockSocket1: WebSocket;
  let mockSocket2: WebSocket;
  let sendMock1: jest.Mock;
  let terminateMock1: jest.Mock;
  let sendMock2: jest.Mock;
  let terminateMock2: jest.Mock;

  beforeEach(() => {
    service = new RoomManagerService();
    sendMock1 = jest.fn();
    terminateMock1 = jest.fn();
    sendMock2 = jest.fn();
    terminateMock2 = jest.fn();

    mockSocket1 = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send: sendMock1,
      terminate: terminateMock1,
    } as unknown as WebSocket;

    mockSocket2 = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send: sendMock2,
      terminate: terminateMock2,
    } as unknown as WebSocket;
  });

  it('should join client to room and track client count', () => {
    service.join(mockSocket1, 'orderbook:BTC_USDT');
    expect(service.getClientCountInRoom('orderbook:BTC_USDT')).toBe(1);
    expect(service.getClientRooms(mockSocket1).has('orderbook:BTC_USDT')).toBe(true);

    service.join(mockSocket2, 'orderbook:BTC_USDT');
    expect(service.getClientCountInRoom('orderbook:BTC_USDT')).toBe(2);
  });

  it('should leave room cleanly and cleanup empty sets', () => {
    service.join(mockSocket1, 'orderbook:BTC_USDT');
    service.leave(mockSocket1, 'orderbook:BTC_USDT');

    expect(service.getClientCountInRoom('orderbook:BTC_USDT')).toBe(0);
    expect(service.getClientRooms(mockSocket1).size).toBe(0);
  });

  it('should remove client from all rooms on disconnect', () => {
    service.join(mockSocket1, 'room1');
    service.join(mockSocket1, 'room2');
    expect(service.getClientRooms(mockSocket1).size).toBe(2);

    service.removeClient(mockSocket1);
    expect(service.getClientCountInRoom('room1')).toBe(0);
    expect(service.getClientCountInRoom('room2')).toBe(0);
    expect(service.getClientRooms(mockSocket1).size).toBe(0);
  });

  it('should broadcast message to all active clients in room', () => {
    service.join(mockSocket1, 'trades:BTC_USDT');
    service.join(mockSocket2, 'trades:BTC_USDT');

    service.broadcastToRoom('trades:BTC_USDT', '{"event":"trade"}');

    expect(sendMock1).toHaveBeenCalledWith('{"event":"trade"}');
    expect(sendMock2).toHaveBeenCalledWith('{"event":"trade"}');
  });

  it('should terminate slow consumer exceeding buffer threshold', () => {
    (mockSocket1 as { bufferedAmount: number }).bufferedAmount = MAX_WS_BUFFER_SIZE_BYTES + 1;
    service.join(mockSocket1, 'orderbook:BTC_USDT');
    service.join(mockSocket2, 'orderbook:BTC_USDT');

    service.broadcastToRoom('orderbook:BTC_USDT', '{"event":"update"}');

    expect(terminateMock1).toHaveBeenCalled();
    expect(sendMock1).not.toHaveBeenCalled();
    expect(sendMock2).toHaveBeenCalledWith('{"event":"update"}');
  });

  it('should format isolated user private room correctly', () => {
    expect(service.getUserPrivateRoom('usr_123', 'orders')).toBe('user:usr_123:orders');
    expect(service.getUserPrivateRoom('usr_123', 'transfers')).toBe('user:usr_123:transfers');
  });
});
