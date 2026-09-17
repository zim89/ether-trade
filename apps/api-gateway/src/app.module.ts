import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth';
import { ClientsModule } from './clients';
import { gatewayConfig, validateEnvironment } from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [gatewayConfig],
      validate: validateEnvironment,
    }),
    ClientsModule,
    AuthModule,
  ],
})
export class AppModule {}
