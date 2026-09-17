import { Module, Global, OnApplicationShutdown, Logger, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { COMMON_LOGS, CONFIG_NAMESPACES } from '@app/common/constants';
import { AppConfig } from '../config';
import { DRIZZLE_CLIENT, DATABASE_POOL } from './database.constants';
import * as schema from './schema';

export type DrizzleDB = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const dbConf = configService.get(CONFIG_NAMESPACES.database, { infer: true });
        const connectionString =
          dbConf.url ||
          `postgres://${dbConf.user}:${dbConf.password}@${dbConf.host}:${dbConf.port}/${dbConf.name}`;

        return postgres(connectionString, {
          max: dbConf.maxConnections,
          idle_timeout: 30,
          connect_timeout: 10,
        });
      },
    },
    {
      provide: DRIZZLE_CLIENT,
      inject: [DATABASE_POOL],
      useFactory: (pool: postgres.Sql) => {
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE_CLIENT, DATABASE_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @Inject(DATABASE_POOL)
    private readonly pool: postgres.Sql,
  ) {}

  async onApplicationShutdown() {
    this.logger.log(COMMON_LOGS.db.closingConnectionPool);
    await this.pool.end();
  }
}
