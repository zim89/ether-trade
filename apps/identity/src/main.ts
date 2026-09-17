import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { COMMON_LOGS, LOGGER_CONTEXTS } from '@app/common/constants';
import { GrpcExceptionFilter } from '@app/common/filters';
import { loadAndValidateEnv } from '@app/common/utils';
import {
  getServiceProtoPath,
  GRPC_SERVICE_KEYS,
  IDENTITY_PACKAGE_NAME,
  IDENTITY_SERVICE_NAME,
} from '@app/contracts';
import { EnvironmentVariables } from './config';
import { IdentityModule } from './identity.module';

async function bootstrap() {
  const logger = new Logger(LOGGER_CONTEXTS.identityBootstrap);

  /*
   * 1. Preload & validate environment variables before IoC assembly (fail-fast).
   */
  const env = loadAndValidateEnv(EnvironmentVariables);

  const grpcUrl = env.IDENTITY_GRPC_URL;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(IdentityModule, {
    transport: Transport.GRPC,
    options: {
      package: IDENTITY_PACKAGE_NAME,
      protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.identity),
      url: grpcUrl,
    },
  });

  app.useGlobalFilters(new GrpcExceptionFilter());
  app.enableShutdownHooks();

  await app.listen();
  logger.log(COMMON_LOGS.bootstrap.grpcServiceRunning(IDENTITY_SERVICE_NAME, grpcUrl));
}

void bootstrap();
