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
  PROTO_PACKAGES,
  PROTO_SERVICES,
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
          const config = configService.get<GatewayConfig>(CONFIG_NAMESPACES.gateway);
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
          const config = configService.get<GatewayConfig>(CONFIG_NAMESPACES.gateway);
          return {
            transport: Transport.GRPC,
            options: {
              package: PROTO_PACKAGES.accounts,
              protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.accounts),
              url: config?.accountsGrpcUrl ?? GRPC_SERVICES_CONFIG.accounts.defaultUrl,
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
  ],
  exports: [NestClientsModule, PROTO_SERVICES.identity, PROTO_SERVICES.accounts],
})
export class ClientsModule {}
