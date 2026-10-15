import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import type { GatewayConfig } from '../config/config.types';
import { OrdersModule } from '../orders/orders.module';
import { KafkaToWebSocketBridgeService } from './kafka-bridge.service';
import { RoomManagerService } from './room-manager.service';
import { TradingGateway } from './trading.gateway';
import { ValkeyPubSubService } from './valkey-pubsub.service';

@Module({
  imports: [
    OrdersModule,
    KafkaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<GatewayConfig>(CONFIG_NAMESPACES.gateway)?.jwtSecret ?? '';
        return {
          secret,
        };
      },
    }),
  ],
  providers: [
    RoomManagerService,
    ValkeyPubSubService,
    TradingGateway,
    KafkaToWebSocketBridgeService,
  ],
  exports: [RoomManagerService, ValkeyPubSubService, TradingGateway, KafkaToWebSocketBridgeService],
})
export class WebSocketsModule {}
