import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { COMMON_LOGS, CONFIG_NAMESPACES } from '@app/common/constants';
import { CopyTradingAppConfig } from '../config';
import { CopyOrdersHistoryRepository } from './copy-orders-history.repository';
import { CopySubscriptionsRepository } from './copy-subscriptions.repository';
import { DATABASE_POOL, DRIZZLE_CLIENT } from './database.constants';
import { MasterTradersRepository } from './master-traders.repository';
import { ProcessedEventsRepository } from './processed-events.repository';
import * as schema from './schema';

export type DrizzleDB = PostgresJsDatabase<typeof schema>;

const repositories = [
  MasterTradersRepository,
  CopySubscriptionsRepository,
  ProcessedEventsRepository,
  CopyOrdersHistoryRepository,
];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<CopyTradingAppConfig, true>) => {
        const dbConf = configService.getOrThrow(CONFIG_NAMESPACES.database, { infer: true });
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
    ...repositories,
  ],
  exports: [DRIZZLE_CLIENT, DATABASE_POOL, ...repositories],
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
