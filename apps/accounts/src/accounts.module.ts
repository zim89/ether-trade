import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DEFAULT_ENV_FILES } from '@app/common/constants';
import { TelemetryModule } from '@app/common/telemetry';
import { BalancesModule } from './balances';
import { appConfig, databaseConfig, validateEnvironment } from './config';
import { ConsumersModule } from './consumers/consumers.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    TelemetryModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
      load: [appConfig, databaseConfig],
      envFilePath: [...DEFAULT_ENV_FILES],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    BalancesModule,
    ConsumersModule,
  ],
})
export class AccountsModule {}
