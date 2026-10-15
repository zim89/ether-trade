import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { COMMON_LOGS, LOGGER_CONTEXTS } from '@app/common/constants';
import { loadAndValidateEnv } from '@app/common/utils';
import { EnvironmentVariables } from './config';
import { CopyTradingModule } from './copy-trading.module';

async function bootstrap() {
  const logger = new Logger(LOGGER_CONTEXTS.copyTradingBootstrap);

  /*
   * Preload & validate environment variables before IoC assembly (fail-fast).
   */
  loadAndValidateEnv(EnvironmentVariables);

  const app = await NestFactory.createApplicationContext(CopyTradingModule);
  app.enableShutdownHooks();

  logger.log(COMMON_LOGS.bootstrap.serviceStarting('COPY_TRADING'));
}

void bootstrap();
