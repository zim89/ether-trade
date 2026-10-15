import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DEFAULT_ENV_FILES } from '@app/common/constants';
import { appConfig, databaseConfig, redisConfig, validateEnvironment } from './config';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [...DEFAULT_ENV_FILES],
      load: [appConfig, databaseConfig, redisConfig],
      validate: validateEnvironment,
    }),
    DatabaseModule,
  ],
})
export class CopyTradingModule {}
