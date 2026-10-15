import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DEFAULT_ENV_FILES } from '@app/common/constants';
import { TelemetryModule } from '@app/common/telemetry';
import { ClientsModule } from './clients/clients.module';
import { appConfig, databaseConfig, redisConfig, validateEnvironment } from './config';
import { DatabaseModule } from './database/database.module';
import { OrdersModule } from './orders/orders.module';
import { OutboxModule } from './outbox/outbox.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    TelemetryModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
      load: [appConfig, databaseConfig, redisConfig],
      envFilePath: [...DEFAULT_ENV_FILES],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    ClientsModule,
    OutboxModule,
    OrdersModule,
  ],
})
export class OrdersAppModule {}
