import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { COMMON_LOGS, LOGGER_CONTEXTS } from '@app/common/constants';
import { GrpcExceptionFilter } from '@app/common/filters';
import { ACCOUNTS_PACKAGE_NAME } from '@app/contracts';
import { AccountsModule } from './accounts.module';
import { ACCOUNTS_GRPC, ACCOUNTS_PROTO_PATH, ENV_KEYS } from './common/constants';

async function bootstrap() {
  const logger = new Logger(LOGGER_CONTEXTS.accountsBootstrap);
  const grpcUrl = process.env[ENV_KEYS.accountsGrpcUrl] ?? ACCOUNTS_GRPC.defaultUrl;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AccountsModule, {
    transport: Transport.GRPC,
    options: {
      package: ACCOUNTS_PACKAGE_NAME,
      protoPath: ACCOUNTS_PROTO_PATH,
      url: grpcUrl,
    },
  });

  app.useGlobalFilters(new GrpcExceptionFilter());
  app.enableShutdownHooks();

  await app.listen();
  logger.log(COMMON_LOGS.bootstrap.grpcServiceRunning('Accounts', grpcUrl));
}

void bootstrap();
