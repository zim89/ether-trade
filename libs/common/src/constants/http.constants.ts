/**
 * Standard HTTP request methods.
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  OPTIONS = 'OPTIONS',
  HEAD = 'HEAD',
}

/**
 * Common standard and custom HTTP header names.
 */
export enum HttpHeader {
  CONTENT_TYPE = 'Content-Type',
  AUTHORIZATION = 'Authorization',
  X_REQUEST_ID = 'x-request-id',
  X_CORRELATION_ID = 'x-correlation-id',
}
