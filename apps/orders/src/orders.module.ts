import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DEFAULT_ENV_FILES } from '@app/common/constants';
import { ClientsModule } from './clients/clients.module';
import { appConfig, databaseConfig, redisConfig, validateEnvironment } from './config';
import { DatabaseModule } from './database/database.module';
import { OrdersModule } from './orders/orders.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
      load: [appConfig, databaseConfig, redisConfig],
      envFilePath: [...DEFAULT_ENV_FILES],
    }),
    DatabaseModule,
    RedisModule,
    ClientsModule,
    OrdersModule,
  ],
})
export class OrdersAppModule {}
