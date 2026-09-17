import { status as GrpcStatus } from '@grpc/grpc-js';
import { Catch, RpcExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

/**
 * Global exception filter for gRPC microservices.
 *
 * Intercepts internal exceptions (`HttpException`, `RpcException`, unhandled `Error`)
 * and transforms them into standard gRPC error payloads (`@grpc/grpc-js` status codes)
 * ensuring structured error propagation across East-West transport.
 */
@Catch()
export class GrpcExceptionFilter implements RpcExceptionFilter<unknown> {
  private readonly logger = new Logger(GrpcExceptionFilter.name);

  /**
   * Catches and maps application exceptions into gRPC error observables.
   *
   * @param exception - The caught error object or exception instance
   * @returns RxJS observable emitting formatted gRPC error payload (`code`, `message`, `details`)
   */
  catch(exception: unknown): Observable<never> {
    let code = GrpcStatus.INTERNAL;
    let message: string | string[] = 'Internal server error';
    let details: unknown = undefined;

    if (exception instanceof RpcException) {
      const error: unknown = exception.getError();
      if (typeof error === 'object' && error !== null) {
        return throwError(() => error);
      }
      return throwError(() => ({
        code: GrpcStatus.INTERNAL,
        message: String(error),
      }));
    }

    if (exception instanceof HttpException) {
      const httpStatus: HttpStatus = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response !== null && 'message' in response) {
        const responseBody = response as { message?: string | string[] };
        message = responseBody.message ?? exception.message;
      } else {
        message = exception.message;
      }
      details = typeof response === 'object' && response !== null ? response : undefined;

      switch (httpStatus) {
        case HttpStatus.BAD_REQUEST:
          code = GrpcStatus.INVALID_ARGUMENT;
          break;
        case HttpStatus.UNAUTHORIZED:
          code = GrpcStatus.UNAUTHENTICATED;
          break;
        case HttpStatus.FORBIDDEN:
          code = GrpcStatus.PERMISSION_DENIED;
          break;
        case HttpStatus.NOT_FOUND:
          code = GrpcStatus.NOT_FOUND;
          break;
        case HttpStatus.CONFLICT:
          code = GrpcStatus.ALREADY_EXISTS;
          break;
        case HttpStatus.TOO_MANY_REQUESTS:
          code = GrpcStatus.RESOURCE_EXHAUSTED;
          break;
        default:
          code = GrpcStatus.INTERNAL;
          break;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
    }

    return throwError(() => ({
      code,
      message: Array.isArray(message) ? message.join('; ') : message,
      details: details ? JSON.stringify(details) : undefined,
    }));
  }
}
