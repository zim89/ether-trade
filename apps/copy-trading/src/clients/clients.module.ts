import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientGrpc, ClientsModule as NestClientsModule, Transport } from '@nestjs/microservices';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import {
  type AccountsServiceClient,
  type OrdersServiceClient,
  getServiceProtoPath,
  GRPC_SERVICE_KEYS,
  GRPC_SERVICES_CONFIG,
  PROTO_PACKAGES,
  PROTO_SERVICES,
} from '@app/contracts';
import { CopyTradingAppConfig } from '../config';

@Global()
@Module({
  imports: [
    NestClientsModule.registerAsync([
      {
        name: PROTO_PACKAGES.accounts,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService<CopyTradingAppConfig, true>) => {
          const appConfig = configService.getOrThrow(CONFIG_NAMESPACES.app, { infer: true });
          return {
            transport: Transport.GRPC,
            options: {
              package: PROTO_PACKAGES.accounts,
              protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.accounts),
              url: appConfig.accountsGrpcUrl ?? GRPC_SERVICES_CONFIG.accounts.defaultUrl,
            },
          };
        },
      },
      {
        name: PROTO_PACKAGES.orders,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService<CopyTradingAppConfig, true>) => {
          const appConfig = configService.getOrThrow(CONFIG_NAMESPACES.app, { infer: true });
          return {
            transport: Transport.GRPC,
            options: {
              package: PROTO_PACKAGES.orders,
              protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.orders),
              url: appConfig.ordersGrpcUrl ?? GRPC_SERVICES_CONFIG.orders.defaultUrl,
            },
          };
        },
      },
    ]),
  ],
  providers: [
    {
      provide: PROTO_SERVICES.accounts,
      useFactory: (client: ClientGrpc): AccountsServiceClient => {
        return client.getService<AccountsServiceClient>(PROTO_SERVICES.accounts);
      },
      inject: [PROTO_PACKAGES.accounts],
    },
    {
      provide: PROTO_SERVICES.orders,
      useFactory: (client: ClientGrpc): OrdersServiceClient => {
        return client.getService<OrdersServiceClient>(PROTO_SERVICES.orders);
      },
      inject: [PROTO_PACKAGES.orders],
    },
  ],
  exports: [NestClientsModule, PROTO_SERVICES.accounts, PROTO_SERVICES.orders],
})
export class ClientsModule {}
