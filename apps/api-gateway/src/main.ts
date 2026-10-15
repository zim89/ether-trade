// eslint-disable-next-line import/order
import { initTracer } from '@app/common/telemetry';

// Initialize OpenTelemetry SDK before loading application modules (fail-safe for Dev & Prod)
initTracer({ serviceName: 'api-gateway' });

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';
import { COMMON_LOGS, LOGGER_CONTEXTS } from '@app/common/constants';
import { HttpExceptionFilter } from '@app/common/filters';
import { PinoLoggerService } from '@app/common/telemetry';
import { loadAndValidateEnv } from '@app/common/utils';
import { AppModule } from './app.module';
import { API_GATEWAY_CONSTANTS } from './common/constants';
import { EnvironmentVariables, getCorsConfig, setupSwagger } from './config';

async function bootstrap() {
  /*
   * 1. Preload & validate environment variables before IoC assembly (fail-fast).
   */
  const env = loadAndValidateEnv(EnvironmentVariables);

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const pinoLogger = app.get(PinoLoggerService);
  app.useLogger(pinoLogger);

  // 1. WebSocket Adapter (@nestjs/platform-ws)
  app.useWebSocketAdapter(new WsAdapter(app));

  // 2. CORS
  app.enableCors(getCorsConfig(env.CORS_ORIGIN));

  // 3. Cookie parser with secret for signed cookies
  app.use(cookieParser(env.COOKIE_SECRET));

  // 4. Global REST API prefix (e.g. /api/v1)
  app.setGlobalPrefix(API_GATEWAY_CONSTANTS.globalPrefix);

  // 5. Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 6. Global HTTP exception filter (unified gRPC and HTTP error response schema)
  app.useGlobalFilters(new HttpExceptionFilter());

  // 7. OpenAPI / Swagger documentation
  const swaggerPath = setupSwagger(app);

  app.enableShutdownHooks();

  await app.listen(env.PORT);

  const baseUrl = `http://localhost:${env.PORT}/${API_GATEWAY_CONSTANTS.globalPrefix}`;
  const swaggerUrl = `http://localhost:${env.PORT}/${swaggerPath}`;
  pinoLogger.log(
    COMMON_LOGS.bootstrap.httpGatewayRunning(baseUrl, swaggerUrl),
    LOGGER_CONTEXTS.apiGatewayBootstrap,
  );
}

void bootstrap();
