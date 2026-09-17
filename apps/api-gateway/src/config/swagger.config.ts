import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SecuritySchemeObject, SwaggerModule } from '@nestjs/swagger';
import { COOKIE_NAMES } from '../common/constants';

/**
 * OpenAPI documentation metadata.
 */
const SWAGGER_CONFIG = {
  path: 'api/docs',
  title: 'Ether-Trade API Gateway',
  description:
    'REST Edge & BFF for Ether-Trade crypto exchange platform: SIWE authentication, balance queries, and developer sandbox.',
  version: '1.0.0',
} as const;

/**
 * OpenAPI Bearer JWT SecurityScheme configuration.
 */
const BEARER_AUTH_CONFIG: SecuritySchemeObject = {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  name: 'Authorization',
  description: 'Enter JWT Access Token',
  in: 'header',
};

/**
 * OpenAPI Refresh Token Cookie SecurityScheme configuration.
 */
const COOKIE_AUTH_CONFIG: SecuritySchemeObject = {
  type: 'apiKey',
  in: 'cookie',
  name: COOKIE_NAMES.refreshToken,
  description: 'HttpOnly Refresh Token cookie',
};

/**
 * Initializes and binds Swagger/OpenAPI documentation to the NestJS application instance.
 *
 * @param app - NestJS application instance
 * @returns The relative swagger UI path (e.g. 'api/docs') for bootstrap logging.
 */
export function setupSwagger(app: INestApplication): string {
  const config = new DocumentBuilder()
    .setTitle(SWAGGER_CONFIG.title)
    .setDescription(SWAGGER_CONFIG.description)
    .setVersion(SWAGGER_CONFIG.version)
    .addBearerAuth(BEARER_AUTH_CONFIG)
    .addCookieAuth(COOKIE_NAMES.refreshToken, COOKIE_AUTH_CONFIG)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_CONFIG.path, app, document);

  return SWAGGER_CONFIG.path;
}
