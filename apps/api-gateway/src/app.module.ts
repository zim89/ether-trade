import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth';
import { BalancesModule } from './balances';
import { ClientsModule } from './clients';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { gatewayConfig, validateEnvironment } from './config';
import { SandboxModule } from './sandbox';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [gatewayConfig],
      validate: validateEnvironment,
    }),
    ClientsModule,
    AuthModule,
    BalancesModule,
    SandboxModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
