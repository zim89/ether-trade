// eslint-disable-next-line import/order
import { initTracer } from '@app/common/telemetry';

// Initialize OpenTelemetry SDK before loading application modules (fail-safe for Dev & Prod)
initTracer({ serviceName: 'transfers-service' });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { COMMON_LOGS, LOGGER_CONTEXTS } from '@app/common/constants';
import { GrpcExceptionFilter } from '@app/common/filters';
import { PinoLoggerService } from '@app/common/telemetry';
import { loadAndValidateEnv } from '@app/common/utils';
import {
  TRANSFERS_PACKAGE_NAME,
  TRANSFERS_SERVICE_NAME,
  getServiceProtoPath,
  GRPC_SERVICE_KEYS,
} from '@app/contracts';
import { EnvironmentVariables } from './config';
import { TransfersAppModule } from './transfers.module';

async function bootstrap() {
  /*
   * Preload & validate environment variables before IoC assembly (fail-fast).
   */
  const env = loadAndValidateEnv(EnvironmentVariables);
  const grpcUrl = env.TRANSFERS_GRPC_URL;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(TransfersAppModule, {
    transport: Transport.GRPC,
    options: {
      package: TRANSFERS_PACKAGE_NAME,
      protoPath: getServiceProtoPath(GRPC_SERVICE_KEYS.transfers),
      url: grpcUrl,
    },
    bufferLogs: true,
  });

  const pinoLogger = app.get(PinoLoggerService);
  app.useLogger(pinoLogger);

  app.useGlobalFilters(new GrpcExceptionFilter());
  app.enableShutdownHooks();

  await app.listen();
  pinoLogger.log(
    COMMON_LOGS.bootstrap.grpcServiceRunning(TRANSFERS_SERVICE_NAME, grpcUrl),
    LOGGER_CONTEXTS.transfersBootstrap,
  );
}

void bootstrap();
