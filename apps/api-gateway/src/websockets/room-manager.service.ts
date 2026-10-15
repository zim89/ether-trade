import { Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';

/**
 * Maximum outbound buffer size (1MB) before terminating a slow consumer connection.
 */
export const MAX_WS_BUFFER_SIZE_BYTES = 1024 * 1024;

/**
 * RoomManagerService
 *
 * High-performance in-memory room management for WebSockets.
 * Maintains a two-way O(1) index:
 *  - rooms: room -> Set<WebSocket>
 *  - clientRooms: WebSocket -> Set<room>
 *
 * Implements Slow Consumer protection and user-level room isolation helpers.
 */
@Injectable()
export class RoomManagerService {
  private readonly logger = new Logger(RoomManagerService.name);
  private readonly rooms = new Map<string, Set<WebSocket>>();
  private readonly clientRooms = new Map<WebSocket, Set<string>>();

  /**
   * Joins a client WebSocket to a specific room.
   */
  join(client: WebSocket, room: string): void {
    let roomClients = this.rooms.get(room);
    if (!roomClients) {
      roomClients = new Set();
      this.rooms.set(room, roomClients);
    }
    roomClients.add(client);

    let clientSubscriptions = this.clientRooms.get(client);
    if (!clientSubscriptions) {
      clientSubscriptions = new Set();
      this.clientRooms.set(client, clientSubscriptions);
    }
    clientSubscriptions.add(room);
  }

  /**
   * Removes a client WebSocket from a specific room.
   */
  leave(client: WebSocket, room: string): void {
    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.delete(client);
      if (roomClients.size === 0) {
        this.rooms.delete(room);
      }
    }

    const clientSubscriptions = this.clientRooms.get(client);
    if (clientSubscriptions) {
      clientSubscriptions.delete(room);
      if (clientSubscriptions.size === 0) {
        this.clientRooms.delete(client);
      }
    }
  }

  /**
   * Fully unregisters a client from all rooms upon disconnect.
   */
  removeClient(client: WebSocket): void {
    const subscriptions = this.clientRooms.get(client);
    if (subscriptions) {
      for (const room of subscriptions) {
        const roomClients = this.rooms.get(room);
        if (roomClients) {
          roomClients.delete(client);
          if (roomClients.size === 0) {
            this.rooms.delete(room);
          }
        }
      }
      this.clientRooms.delete(client);
    }
  }

  /**
   * Broadcasts a raw string payload to all active clients in a given room.
   * Protects against slow consumers accumulating oversized socket buffers.
   */
  broadcastToRoom(room: string, payload: string): void {
    const clients = this.rooms.get(room);
    if (!clients || clients.size === 0) {
      return;
    }

    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        // Slow consumer detection: terminate if socket buffer overflows threshold
        if (ws.bufferedAmount > MAX_WS_BUFFER_SIZE_BYTES) {
          this.logger.warn(
            `Slow consumer detected in room '${room}'. Terminating socket (bufferedAmount: ${ws.bufferedAmount} bytes)`,
          );
          ws.terminate();
          continue;
        }
        ws.send(payload);
      }
    }
  }

  /**
   * Returns current count of clients in a given room.
   */
  getClientCountInRoom(room: string): number {
    return this.rooms.get(room)?.size ?? 0;
  }

  /**
   * Returns a copy of rooms the client is currently subscribed to.
   */
  getClientRooms(client: WebSocket): Set<string> {
    return new Set(this.clientRooms.get(client) ?? []);
  }

  /**
   * Generates isolated private room name for a specific user and topic.
   */
  getUserPrivateRoom(userId: string, subTopic: 'orders' | 'transfers'): string {
    return `user:${userId}:${subTopic}`;
  }
}
