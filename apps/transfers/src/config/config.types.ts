import { ConfigType } from '@nestjs/config';
import { appConfig } from './app.config';
import { databaseConfig } from './database.config';

export type AppConfig = ConfigType<typeof appConfig>;
export type DatabaseConfig = ConfigType<typeof databaseConfig>;
