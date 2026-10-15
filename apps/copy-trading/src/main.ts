import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { COMMON_LOGS, LOGGER_CONTEXTS } from '@app/common/constants';
import { GrpcExceptionFilter } from '@app/common/filters';
import { loadAndValidateEnv } from '@app/common/utils';
import {
  COPY_TRADING_PACKAGE_NAME,
  COPY_TRADING_SERVICE_NAME,
  getServiceProtoPath,
  GRPC_SERVICE_KEYS,
} from '@app/contracts';
import { EnvironmentVariables } from './config';
import { CopyTradingModule } from './copy-trading.module';

async function bootstrap() {
  const logger = new Logger(LOGGER_CONTEXTS.copyTradingBootstrap);

  /*
   * Preload & validate environment variables before IoC assembly (fail-fast).
   */
  const env = loadAndValidateEnv(EnvironmentVariables);
  const grpcUrl = env.COPY_TRADING_GRPC_URL;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(CopyTradingModule, {
    transport: Transport.GRPC,
    options: {
      package: COPY_TRADING_PACKAGE_NAME,
      protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.copyTrading),
      url: grpcUrl,
    },
  });

  app.useGlobalFilters(new GrpcExceptionFilter());
  app.enableShutdownHooks();

  await app.listen();
  logger.log(COMMON_LOGS.bootstrap.grpcServiceRunning(COPY_TRADING_SERVICE_NAME, grpcUrl));
}

void bootstrap();
