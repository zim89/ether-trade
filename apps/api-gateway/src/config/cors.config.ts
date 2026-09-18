import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { HttpHeader, HttpMethod } from '@app/common/constants';

/**
 * Default HTTP methods allowed across API Gateway endpoints.
 */
const CORS_ALLOWED_METHODS: readonly HttpMethod[] = [
  HttpMethod.GET,
  HttpMethod.POST,
  HttpMethod.PUT,
  HttpMethod.PATCH,
  HttpMethod.DELETE,
  HttpMethod.OPTIONS,
];

/**
 * Default HTTP headers allowed across API Gateway endpoints.
 */
const CORS_ALLOWED_HEADERS: readonly HttpHeader[] = [
  HttpHeader.CONTENT_TYPE,
  HttpHeader.AUTHORIZATION,
  HttpHeader.X_REQUEST_ID,
  HttpHeader.X_CORRELATION_ID,
];

/**
 * Generates CORS configuration options for NestJS application.
 *
 * @param origin - Allowed origin or array of origins
 * @returns Strongly typed CorsOptions object
 */
export function getCorsConfig(origin: string | string[]): CorsOptions {
  return {
    origin,
    credentials: true,
    methods: [...CORS_ALLOWED_METHODS],
    allowedHeaders: [...CORS_ALLOWED_HEADERS],
  };
}
