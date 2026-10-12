import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { COMMON_LOGS } from '@app/common/constants';
import { GrpcExceptionFilter } from '@app/common/filters';
import { loadAndValidateEnv } from '@app/common/utils';
import {
  ORDERS_PACKAGE_NAME,
  ORDERS_SERVICE_NAME,
  getServiceProtoPath,
  GRPC_SERVICE_KEYS,
} from '@app/contracts';
import { EnvironmentVariables } from './config';
import { OrdersAppModule } from './orders.module';

async function bootstrap() {
  const logger = new Logger('OrdersBootstrap');

  /*
   * Preload & validate environment variables before IoC assembly (fail-fast).
   */
  const env = loadAndValidateEnv(EnvironmentVariables);
  const grpcUrl = env.ORDERS_GRPC_URL;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(OrdersAppModule, {
    transport: Transport.GRPC,
    options: {
      package: ORDERS_PACKAGE_NAME,
      protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.orders),
      url: grpcUrl,
    },
  });

  app.useGlobalFilters(new GrpcExceptionFilter());
  app.enableShutdownHooks();

  await app.listen();
  logger.log(COMMON_LOGS.bootstrap.grpcServiceRunning(ORDERS_SERVICE_NAME, grpcUrl));
}

void bootstrap();
