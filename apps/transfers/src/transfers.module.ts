import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DEFAULT_ENV_FILES } from '@app/common/constants';
import { ClientsModule } from './clients';
import { appConfig, databaseConfig, validateEnvironment } from './config';
import { DatabaseModule } from './database/database.module';
import { TransfersOutboxModule } from './outbox/transfers-outbox.module';
import { TransfersSubModule } from './transfers/transfers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [...DEFAULT_ENV_FILES],
      load: [appConfig, databaseConfig],
      validate: validateEnvironment,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    ClientsModule,
    TransfersOutboxModule,
    TransfersSubModule,
  ],
})
export class TransfersAppModule {}
