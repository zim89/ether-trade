import { Module } from '@nestjs/common';
import { RoomManagerService } from './room-manager.service';
import { ValkeyPubSubService } from './valkey-pubsub.service';

@Module({
  providers: [RoomManagerService, ValkeyPubSubService],
  exports: [RoomManagerService, ValkeyPubSubService],
})
export class WebSocketsModule {}
