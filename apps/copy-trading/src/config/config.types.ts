import { ConfigType } from '@nestjs/config';
import { appConfig } from './app.config';
import { databaseConfig } from './database.config';
import { redisConfig } from './redis.config';

export type CopyTradingAppConfig = {
  app: ConfigType<typeof appConfig>;
  database: ConfigType<typeof databaseConfig>;
  redis: ConfigType<typeof redisConfig>;
};
