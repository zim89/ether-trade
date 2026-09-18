import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { COMMON_LOGS, LOGGER_CONTEXTS } from '@app/common/constants';
import { HttpExceptionFilter } from '@app/common/filters';
import { loadAndValidateEnv } from '@app/common/utils';
import { AppModule } from './app.module';
import { API_GATEWAY_CONSTANTS } from './common/constants';
import { EnvironmentVariables, getCorsConfig, setupSwagger } from './config';

async function bootstrap() {
  const logger = new Logger(LOGGER_CONTEXTS.apiGatewayBootstrap);

  /*
   * 1. Preload & validate environment variables before IoC assembly (fail-fast).
   */
  const env = loadAndValidateEnv(EnvironmentVariables);

  const app = await NestFactory.create(AppModule);

  // 1. CORS
  app.enableCors(getCorsConfig(env.CORS_ORIGIN));

  // 2. Cookie parser with secret for signed cookies
  app.use(cookieParser(env.COOKIE_SECRET));

  // 3. Global REST API prefix (e.g. /api/v1)
  app.setGlobalPrefix(API_GATEWAY_CONSTANTS.globalPrefix);

  // 4. Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 5. Global HTTP exception filter (unified gRPC and HTTP error response schema)
  app.useGlobalFilters(new HttpExceptionFilter());

  // 6. OpenAPI / Swagger documentation
  const swaggerPath = setupSwagger(app);

  app.enableShutdownHooks();

  await app.listen(env.PORT);

  const baseUrl = `http://localhost:${env.PORT}/${API_GATEWAY_CONSTANTS.globalPrefix}`;
  const swaggerUrl = `http://localhost:${env.PORT}/${swaggerPath}`;
  logger.log(COMMON_LOGS.bootstrap.httpGatewayRunning(baseUrl, swaggerUrl));
}

void bootstrap();
