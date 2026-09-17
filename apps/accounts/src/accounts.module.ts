import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DEFAULT_ENV_FILES } from '@app/common/constants';
import { BalancesModule } from './balances/balances.module';
import { appConfig, databaseConfig, validate } from './config';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      load: [appConfig, databaseConfig],
      envFilePath: [...DEFAULT_ENV_FILES],
    }),
    DatabaseModule,
    BalancesModule,
  ],
})
export class AccountsModule {}
