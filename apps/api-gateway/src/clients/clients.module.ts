import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientGrpc, ClientsModule as NestClientsModule, Transport } from '@nestjs/microservices';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import {
  AccountsServiceClient,
  getServiceProtoPath,
  GRPC_SERVICE_KEYS,
  GRPC_SERVICES_CONFIG,
  IdentityServiceClient,
  OrdersServiceClient,
  PROTO_PACKAGES,
  PROTO_SERVICES,
  TransfersServiceClient,
} from '@app/contracts';
import { GatewayConfig } from '../config';

@Global()
@Module({
  imports: [
    NestClientsModule.registerAsync([
      {
        name: PROTO_PACKAGES.identity,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const config = configService.getOrThrow<GatewayConfig>(CONFIG_NAMESPACES.gateway);
          return {
            transport: Transport.GRPC,
            options: {
              package: PROTO_PACKAGES.identity,
              protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.identity),
              url: config?.identityGrpcUrl ?? GRPC_SERVICES_CONFIG.identity.defaultUrl,
            },
          };
        },
      },
      {
        name: PROTO_PACKAGES.accounts,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const config = configService.getOrThrow<GatewayConfig>(CONFIG_NAMESPACES.gateway);
          return {
            transport: Transport.GRPC,
            options: {
              package: PROTO_PACKAGES.accounts,
              protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.accounts),
              url: config.accountsGrpcUrl || GRPC_SERVICES_CONFIG.accounts.defaultUrl,
            },
          };
        },
      },
      {
        name: PROTO_PACKAGES.orders,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const config = configService.getOrThrow<GatewayConfig>(CONFIG_NAMESPACES.gateway);
          return {
            transport: Transport.GRPC,
            options: {
              package: PROTO_PACKAGES.orders,
              protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.orders),
              url: config.ordersGrpcUrl || GRPC_SERVICES_CONFIG.orders.defaultUrl,
            },
          };
        },
      },
      {
        name: PROTO_PACKAGES.transfers,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const config = configService.getOrThrow<GatewayConfig>(CONFIG_NAMESPACES.gateway);
          return {
            transport: Transport.GRPC,
            options: {
              package: PROTO_PACKAGES.transfers,
              protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.transfers),
              url: config.transfersGrpcUrl || GRPC_SERVICES_CONFIG.transfers.defaultUrl,
            },
          };
        },
      },
    ]),
  ],
  providers: [
    {
      provide: PROTO_SERVICES.identity,
      useFactory: (client: ClientGrpc): IdentityServiceClient => {
        return client.getService<IdentityServiceClient>(PROTO_SERVICES.identity);
      },
      inject: [PROTO_PACKAGES.identity],
    },
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
    {
      provide: PROTO_SERVICES.transfers,
      useFactory: (client: ClientGrpc): TransfersServiceClient => {
        return client.getService<TransfersServiceClient>(PROTO_SERVICES.transfers);
      },
      inject: [PROTO_PACKAGES.transfers],
    },
  ],
  exports: [
    NestClientsModule,
    PROTO_SERVICES.identity,
    PROTO_SERVICES.accounts,
    PROTO_SERVICES.orders,
    PROTO_SERVICES.transfers,
  ],
})
export class ClientsModule {}
