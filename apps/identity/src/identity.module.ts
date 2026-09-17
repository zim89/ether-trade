import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DEFAULT_ENV_FILES } from '@app/common/constants';
import { AuthModule } from './auth/auth.module';
import { appConfig, authConfig, databaseConfig, redisConfig, validateEnvironment } from './config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
      load: [appConfig, databaseConfig, redisConfig, authConfig],
      envFilePath: [...DEFAULT_ENV_FILES],
    }),
    DatabaseModule,
    RedisModule,
    UsersModule,
    AuthModule,
  ],
})
export class IdentityModule {}
