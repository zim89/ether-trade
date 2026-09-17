import { ConfigType } from '@nestjs/config';
import { appConfig } from './app.config';
import { authConfig } from './auth.config';
import { databaseConfig } from './database.config';
import { redisConfig } from './redis.config';

export type AppConfig = {
  app: ConfigType<typeof appConfig>;
  database: ConfigType<typeof databaseConfig>;
  redis: ConfigType<typeof redisConfig>;
  auth: ConfigType<typeof authConfig>;
};
