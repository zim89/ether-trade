import { status as GrpcStatus } from '@grpc/grpc-js';
import { ArgumentsHost, HttpStatus, HttpException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { GrpcExceptionFilter } from './grpc-exception.filter';
import { HttpExceptionFilter } from './http-exception.filter';

describe('Exception Filters OpenTelemetry Status (Unit)', () => {
  let mockSpan: {
    recordException: jest.Mock;
    setStatus: jest.Mock;
  };

  beforeEach(() => {
    mockSpan = {
      recordException: jest.fn(),
      setStatus: jest.fn(),
    };

    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(mockSpan as unknown as Span);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HttpExceptionFilter', () => {
    it('should record exception and set ERROR span status on HttpException', () => {
      const filter = new HttpExceptionFilter();
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ method: 'POST', url: '/api/v1/orders' }),
        }),
      } as ArgumentsHost;

      const exception = new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockSpan.recordException).toHaveBeenCalledWith(exception);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Invalid payload',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });

    it('should record exception and set ERROR span status on unhandled Error', () => {
      const filter = new HttpExceptionFilter();
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ method: 'GET', url: '/health' }),
        }),
      } as ArgumentsHost;

      const exception = new Error('Database connection lost');

      filter.catch(exception, mockHost);

      expect(mockSpan.recordException).toHaveBeenCalledWith(exception);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Database connection lost',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('GrpcExceptionFilter', () => {
    it('should record exception and set ERROR span status on gRPC exception', (done) => {
      const filter = new GrpcExceptionFilter();
      const exception = new RpcException({
        code: GrpcStatus.INVALID_ARGUMENT,
        message: 'Order quantity below min limit',
      });

      filter.catch(exception).subscribe({
        error: (err) => {
          expect(mockSpan.recordException).toHaveBeenCalled();
          expect(mockSpan.setStatus).toHaveBeenCalledWith({
            code: SpanStatusCode.ERROR,
            message: 'Order quantity below min limit',
          });
          expect(err.code).toBe(GrpcStatus.INVALID_ARGUMENT);
          done();
        },
      });
    });
  });
});
