import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { TimeoutError } from 'rxjs';
import { COMMON_ERROR_CODES, COMMON_ERRORS } from '../constants';
import { extractErrorCode, parseErrorDetails } from '../utils';

/**
 * Standardized HTTP error response shape across Ether-Trade ecosystem.
 */
export interface HttpErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  errorCode?: string;
}

/**
 * Known gRPC microservice ports and their corresponding service names and startup commands.
 */
const KNOWN_GRPC_SERVICES: Record<number, { name: string; command: string }> = {
  50051: { name: 'identity', command: 'pnpm start:dev:identity' },
  50052: { name: 'accounts', command: 'pnpm start:dev:accounts' },
  50053: { name: 'orders', command: 'pnpm start:dev:orders' },
};

/**
 * Mapping table from gRPC status codes to standard HTTP status codes.
 */
const GRPC_TO_HTTP_STATUS: Record<number, HttpStatus> = {
  [GrpcStatus.OK]: HttpStatus.OK,
  [GrpcStatus.CANCELLED]: HttpStatus.REQUEST_TIMEOUT,
  [GrpcStatus.UNKNOWN]: HttpStatus.BAD_GATEWAY,
  [GrpcStatus.INVALID_ARGUMENT]: HttpStatus.BAD_REQUEST,
  [GrpcStatus.DEADLINE_EXCEEDED]: HttpStatus.GATEWAY_TIMEOUT,
  [GrpcStatus.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [GrpcStatus.ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [GrpcStatus.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [GrpcStatus.RESOURCE_EXHAUSTED]: HttpStatus.TOO_MANY_REQUESTS,
  [GrpcStatus.FAILED_PRECONDITION]: HttpStatus.BAD_REQUEST,
  [GrpcStatus.ABORTED]: HttpStatus.CONFLICT,
  [GrpcStatus.OUT_OF_RANGE]: HttpStatus.BAD_REQUEST,
  [GrpcStatus.UNIMPLEMENTED]: HttpStatus.NOT_IMPLEMENTED,
  [GrpcStatus.INTERNAL]: HttpStatus.INTERNAL_SERVER_ERROR,
  [GrpcStatus.UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [GrpcStatus.DATA_LOSS]: HttpStatus.INTERNAL_SERVER_ERROR,
  [GrpcStatus.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
};

/**
 * Global HTTP exception filter for API Gateway.
 *
 * Intercepts both native NestJS HttpExceptions and downstream gRPC transport errors,
 * translating them into a unified, RFC-compliant JSON response with descriptive diagnostics.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorCode: string | undefined;

    // 1. Native NestJS HttpException (ValidationPipe, Guards, explicit controller exceptions)
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const body = exceptionResponse as { message?: string | string[] };
        message = body.message ?? exception.message;
        errorCode = extractErrorCode(exceptionResponse);
      } else {
        message = exception.message;
      }
    }
    // 2. Downstream gRPC error from @grpc/grpc-js
    else if (this.isGrpcError(exception)) {
      const grpcCode = exception.code;
      statusCode = GRPC_TO_HTTP_STATUS[grpcCode] ?? HttpStatus.BAD_GATEWAY;

      if (grpcCode === GrpcStatus.UNAVAILABLE || this.isConnectionRefused(exception)) {
        statusCode = HttpStatus.SERVICE_UNAVAILABLE;
        message = this.formatUnavailableMessage(exception);
      } else {
        const extracted = this.extractGrpcErrorPayload(exception);
        message = extracted.message;
        errorCode = extracted.errorCode;
      }
    }
    // 3. Client-side RxJS timeout around gRPC Observable
    else if (exception instanceof TimeoutError || this.isTimeoutError(exception)) {
      statusCode = HttpStatus.GATEWAY_TIMEOUT;
      message = COMMON_ERRORS.grpc.upstreamTimeout;
      errorCode = COMMON_ERROR_CODES.deadlineExceeded;
    }
    // 4. Unhandled runtime JS Error
    else if (exception instanceof Error) {
      if (this.isConnectionRefused(exception)) {
        statusCode = HttpStatus.SERVICE_UNAVAILABLE;
        message = this.formatUnavailableMessage(exception);
      } else {
        statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        const isProduction = process.env.NODE_ENV === 'production';
        message = isProduction ? 'Internal server error' : exception.message;
      }
    }

    const errorName = HttpStatus[statusCode] ?? 'Error';

    const responseBody: HttpErrorResponseBody = {
      statusCode,
      message,
      error: this.formatErrorName(errorName),
      timestamp: new Date().toISOString(),
      path: request?.originalUrl || request?.url || 'unknown',
    };
    if (errorCode) {
      responseBody.errorCode = errorCode;
    }

    // Log with appropriate severity level
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `HTTP ${statusCode} [${request?.method ?? 'UNKNOWN'} ${responseBody.path}]: ${Array.isArray(message) ? message.join('; ') : message}`,
        stack,
      );
    } else {
      this.logger.warn(
        `HTTP ${statusCode} [${request?.method ?? 'UNKNOWN'} ${responseBody.path}]: ${Array.isArray(message) ? message.join('; ') : message}`,
      );
    }

    response.status(statusCode).json(responseBody);
  }

  /**
   * Detects whether the caught object has the properties of a gRPC call error.
   */
  private isGrpcError(
    error: unknown,
  ): error is { code: GrpcStatus; details?: string; message: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as Record<string, unknown>).code === 'number' &&
      'message' in error
    );
  }

  /**
   * Detects RxJS / Nest timeout-shaped errors without relying solely on instanceof.
   */
  private isTimeoutError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    const name = (error as { name?: string }).name;
    const msg = (error as { message?: string }).message ?? '';
    return name === 'TimeoutError' || msg.toLowerCase().includes('timeout');
  }

  /**
   * Checks whether the error indicates a refused TCP connection.
   */
  private isConnectionRefused(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const err = error as { message?: string; details?: string };
    const str = `${err.message || ''} ${err.details || ''}`;
    return str.includes('ECONNREFUSED') || str.includes('No connection established');
  }

  /**
   * Generates a descriptive error message for unavailable upstream microservices.
   */
  private formatUnavailableMessage(error: { message?: string; details?: string }): string {
    const rawText = `${error.details || ''} ${error.message || ''}`;
    const portMatch = rawText.match(/:(\d{5})/);

    if (portMatch) {
      const port = Number(portMatch[1]);
      const knownService = KNOWN_GRPC_SERVICES[port];

      if (knownService) {
        return `Upstream microservice '${knownService.name}' (port ${port}) is unavailable. Please ensure '${knownService.command}' is running.`;
      }
      return `Upstream microservice on port ${port} is unavailable (connection refused).`;
    }

    return 'Upstream microservice is currently unavailable. Please verify downstream services are running.';
  }

  /**
   * Extracts clean domain message and optional errorCode from gRPC details.
   */
  private extractGrpcErrorPayload(error: { details?: string; message: string }): {
    message: string | string[];
    errorCode?: string;
  } {
    if (error.details) {
      const parsed = parseErrorDetails(error.details);
      if (parsed) {
        return { message: parsed.message, errorCode: parsed.errorCode };
      }
      return { message: error.details };
    }

    const cleaned = error.message.replace(/^\d+\s+[A-Z_]+:\s*/, '').trim();
    return { message: cleaned || error.message };
  }

  /**
   * Transforms SCREAMING_SNAKE_CASE enum names into Title Case (e.g. SERVICE_UNAVAILABLE -> Service Unavailable).
   */
  private formatErrorName(name: string): string {
    return name
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
