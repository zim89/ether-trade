import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DEFAULT_ENV_FILES } from '@app/common/constants';
import { TelemetryModule } from '@app/common/telemetry';
import { CopyRatioCalculator } from './calculator/copy-ratio.calculator';
import { ClientsModule } from './clients/clients.module';
import { appConfig, databaseConfig, redisConfig, validateEnvironment } from './config';
import { ConsumersModule } from './consumers/consumers.module';
import { CopyTradingController } from './copy-trading.controller';
import { CopyTradingService } from './copy-trading.service';
import { DatabaseModule } from './database/database.module';
import { LockModule } from './lock/lock.module';
import { RedisModule } from './redis/redis.module';
import { RiskGuardService } from './risk/risk-guard.service';

@Module({
  imports: [
    TelemetryModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [...DEFAULT_ENV_FILES],
      load: [appConfig, databaseConfig, redisConfig],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    RedisModule,
    LockModule,
    ClientsModule,
    ConsumersModule,
  ],
  controllers: [CopyTradingController],
  providers: [CopyRatioCalculator, RiskGuardService, CopyTradingService],
  exports: [CopyRatioCalculator, RiskGuardService, CopyTradingService],
})
export class CopyTradingModule {}
