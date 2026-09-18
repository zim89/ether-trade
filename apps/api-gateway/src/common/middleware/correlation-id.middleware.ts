import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';
import { GRPC_METADATA_KEYS } from '@app/contracts';
import { runWithCorrelationId } from '../utils/correlation-context';

export const CORRELATION_ID_HEADER = GRPC_METADATA_KEYS.correlationId;

export type RequestWithCorrelationId = Request & {
  correlationId: string;
};

/**
 * Ensures every HTTP request has an `x-correlation-id` before Guards / ValidationPipe.
 * Stores the id in AsyncLocalStorage so singleton services can attach it to gRPC metadata.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_ID_HEADER);
    const correlationId =
      typeof incoming === 'string' && incoming.trim().length > 0 ? incoming.trim() : uuidv7();

    (req as RequestWithCorrelationId).correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    runWithCorrelationId(correlationId, () => next());
  }
}
