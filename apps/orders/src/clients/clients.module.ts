import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientGrpc, ClientsModule as NestClientsModule, Transport } from '@nestjs/microservices';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import {
  AccountsServiceClient,
  getServiceProtoPath,
  GRPC_SERVICE_KEYS,
  GRPC_SERVICES_CONFIG,
  PROTO_PACKAGES,
  PROTO_SERVICES,
} from '@app/contracts';
import { OrdersAppConfig } from '../config';

@Global()
@Module({
  imports: [
    NestClientsModule.registerAsync([
      {
        name: PROTO_PACKAGES.accounts,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService<OrdersAppConfig, true>) => {
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
  ],
  exports: [NestClientsModule, PROTO_SERVICES.accounts],
})
export class ClientsModule {}
