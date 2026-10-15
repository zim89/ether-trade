import { Injectable, NestMiddleware } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';
import { GRPC_METADATA_KEYS } from '@app/contracts';
import { runWithCorrelationId } from '../utils/correlation-context';

export const CORRELATION_ID_HEADER = GRPC_METADATA_KEYS.correlationId;
export const TRACE_ID_HEADER = 'x-trace-id';
export const TRACEPARENT_HEADER = 'traceparent';

export type RequestWithCorrelationId = Request & {
  correlationId: string;
};

/**
 * Ensures every HTTP request has an `x-correlation-id` before Guards / ValidationPipe.
 * Stores the id in AsyncLocalStorage so singleton services can attach it to gRPC metadata.
 * Also attaches dual tracing headers (`x-trace-id` and `traceparent`) for client observability.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_ID_HEADER);
    const correlationId =
      typeof incoming === 'string' && incoming.trim().length > 0 ? incoming.trim() : uuidv7();

    (req as RequestWithCorrelationId).correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    // Dual headers for client-side tracing and support tickets
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      if (trace.isSpanContextValid(spanContext)) {
        res.setHeader(TRACE_ID_HEADER, spanContext.traceId);
        const traceFlags = spanContext.traceFlags.toString(16).padStart(2, '0');
        res.setHeader(
          TRACEPARENT_HEADER,
          `00-${spanContext.traceId}-${spanContext.spanId}-${traceFlags}`,
        );
      }
    }

    runWithCorrelationId(correlationId, () => next());
  }
}
