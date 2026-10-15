import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import pino, { Logger as PinoInstance } from 'pino';

export interface PinoLoggerOptions {
  level?: string;
  pretty?: boolean;
}

const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'signature',
  'privatekey',
  'secret',
  'password',
  'token',
  'apikey',
];

/**
 * Custom serializer to scrub sensitive information (tokens, private keys, cookies, signatures).
 */
function sanitizeValue(key: string, value: unknown): unknown {
  const lowerKey = key.toLowerCase();
  if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
    return '[REDACTED]';
  }
  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      sanitized[k] = sanitizeObject(v as Record<string, unknown>);
    } else {
      sanitized[k] = sanitizeValue(k, v);
    }
  }
  return sanitized;
}

@Injectable({ scope: Scope.DEFAULT })
export class PinoLoggerService implements LoggerService {
  private readonly pino: PinoInstance;
  private contextName?: string;

  constructor(options: PinoLoggerOptions = {}) {
    const isDev = process.env.NODE_ENV !== 'production' && options.pretty !== false;
    const level = options.level || process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

    if (isDev && process.env.NODE_ENV !== 'test') {
      this.pino = pino({
        level,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      });
    } else {
      this.pino = pino({
        level,
        base: {
          service: process.env.OTEL_SERVICE_NAME || process.env.APP_NAME || 'ether-trade',
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      });
    }
  }

  setContext(context: string) {
    this.contextName = context;
  }

  private enrich(context?: string): Record<string, unknown> {
    const meta: Record<string, unknown> = {
      context: context || this.contextName || 'Application',
    };

    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      if (spanContext.traceId) {
        meta.trace_id = spanContext.traceId;
        meta.span_id = spanContext.spanId;
        meta.trace_flags = spanContext.traceFlags;
      }
    }

    return meta;
  }

  private formatMessage(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }
    if (message instanceof Error) {
      return message.message;
    }
    return JSON.stringify(message);
  }

  private formatOptionalParams(optionalParams: unknown[]): {
    context?: string;
    extra: Record<string, unknown>;
  } {
    let context: string | undefined;
    const extra: Record<string, unknown> = {};

    if (optionalParams.length > 0) {
      const last = optionalParams[optionalParams.length - 1];
      if (typeof last === 'string') {
        context = last;
      }

      for (const param of optionalParams) {
        if (param && typeof param === 'object') {
          Object.assign(extra, sanitizeObject(param as Record<string, unknown>));
        }
      }
    }

    return { context, extra };
  }

  log(message: unknown, ...optionalParams: unknown[]) {
    const { context, extra } = this.formatOptionalParams(optionalParams);
    const meta = { ...this.enrich(context), ...extra };
    this.pino.info(meta, this.formatMessage(message));
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    const { context, extra } = this.formatOptionalParams(optionalParams);
    const meta = { ...this.enrich(context), ...extra };

    let traceStr: string | undefined;
    for (const param of optionalParams) {
      if (typeof param === 'string' && param.includes('\n')) {
        traceStr = param;
        break;
      } else if (param instanceof Error && param.stack) {
        traceStr = param.stack;
        break;
      }
    }

    if (traceStr) {
      meta.stack = traceStr;
    }

    this.pino.error(meta, this.formatMessage(message));
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    const { context, extra } = this.formatOptionalParams(optionalParams);
    const meta = { ...this.enrich(context), ...extra };
    this.pino.warn(meta, this.formatMessage(message));
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    const { context, extra } = this.formatOptionalParams(optionalParams);
    const meta = { ...this.enrich(context), ...extra };
    this.pino.debug(meta, this.formatMessage(message));
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    const { context, extra } = this.formatOptionalParams(optionalParams);
    const meta = { ...this.enrich(context), ...extra };
    this.pino.trace(meta, this.formatMessage(message));
  }
}
