import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { COMMON_LOGS, LOGGER_CONTEXTS } from '@app/common/constants';
import { GrpcExceptionFilter } from '@app/common/filters';
import { loadEnv } from '@app/common/utils';
import { IDENTITY_PACKAGE_NAME } from '@app/contracts';
import { ENV_KEYS, IDENTITY_GRPC, IDENTITY_PROTO_PATH } from './common/constants';
import { validate } from './config';
import { IdentityModule } from './identity.module';

async function bootstrap() {
  const logger = new Logger(LOGGER_CONTEXTS.identityBootstrap);

  /*
   * 1. Preload environment variables before IoC container assembly
   * (uses DEFAULT_ENV_FILES cascade: .env.development.local -> .env.development -> .env).
   */
  loadEnv();

  /*
   * 2. Early environment validation (fail-fast before binding network sockets).
   */
  validate(process.env);

  const grpcUrl = process.env[ENV_KEYS.identityGrpcUrl] ?? IDENTITY_GRPC.defaultUrl;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(IdentityModule, {
    transport: Transport.GRPC,
    options: {
      package: IDENTITY_PACKAGE_NAME,
      protoPath: IDENTITY_PROTO_PATH,
      url: grpcUrl,
    },
  });

  app.useGlobalFilters(new GrpcExceptionFilter());
  app.enableShutdownHooks();

  await app.listen();
  logger.log(COMMON_LOGS.bootstrap.grpcServiceRunning('Identity', grpcUrl));
}

void bootstrap();
