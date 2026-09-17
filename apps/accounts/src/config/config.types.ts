import { ConfigType } from '@nestjs/config';
import { appConfig } from './app.config';
import { databaseConfig } from './database.config';

export type AppConfig = {
  app: ConfigType<typeof appConfig>;
  database: ConfigType<typeof databaseConfig>;
};
