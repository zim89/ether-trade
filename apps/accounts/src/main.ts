import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { COMMON_LOGS, LOGGER_CONTEXTS } from '@app/common/constants';
import { GrpcExceptionFilter } from '@app/common/filters';
import { loadAndValidateEnv } from '@app/common/utils';
import {
  ACCOUNTS_PACKAGE_NAME,
  ACCOUNTS_SERVICE_NAME,
  getServiceProtoPath,
  GRPC_SERVICE_KEYS,
} from '@app/contracts';
import { AccountsModule } from './accounts.module';
import { EnvironmentVariables } from './config';

async function bootstrap() {
  const logger = new Logger(LOGGER_CONTEXTS.accountsBootstrap);

  /*
   * 1. Preload & validate environment variables before IoC assembly (fail-fast).
   */
  const env = loadAndValidateEnv(EnvironmentVariables);

  const grpcUrl = env.ACCOUNTS_GRPC_URL;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AccountsModule, {
    transport: Transport.GRPC,
    options: {
      package: ACCOUNTS_PACKAGE_NAME,
      protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.accounts),
      url: grpcUrl,
    },
  });

  app.useGlobalFilters(new GrpcExceptionFilter());
  app.enableShutdownHooks();

  await app.listen();
  logger.log(COMMON_LOGS.bootstrap.grpcServiceRunning(ACCOUNTS_SERVICE_NAME, grpcUrl));
}

void bootstrap();
