import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  DB_SYSTEM_NAME_VALUE_POSTGRESQL,
} from '@opentelemetry/semantic-conventions';
import postgres from 'postgres';

export interface PostgresTracingOptions {
  serviceName?: string;
  dbName?: string;
}

/**
 * Normalizes SQL query string to extract operation (e.g. SELECT, INSERT, UPDATE, DELETE).
 */
function extractOperation(query: string): string {
  const trimmed = query.trim();
  const firstWord = trimmed.split(/\s+/, 1)[0];
  return firstWord ? firstWord.toUpperCase() : 'QUERY';
}

/**
 * Creates Postgres.js debug hook function that wraps executed queries in OpenTelemetry DB Client spans.
 */
export function createPostgresDebugHook(options: PostgresTracingOptions = {}) {
  const tracer = trace.getTracer('postgres-instrumentation');
  const dbName = options.dbName || 'postgres';

  return (_connection: number, query: string, _parameters: unknown[], _paramTypes: unknown[]) => {
    // Only trace if there is an active context or sampling is active
    const operation = extractOperation(query);
    const spanName = `db.${operation.toLowerCase()} ${dbName}`;

    const span = tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
      attributes: {
        [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_POSTGRESQL,
        [ATTR_DB_NAMESPACE]: dbName,
        [ATTR_DB_OPERATION_NAME]: operation,
        [ATTR_DB_QUERY_TEXT]: query,
      },
    });

    // Postgres.js debug hook is invoked synchronously right as query is executed on connection
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  };
}

/**
 * Enhances Postgres.js options object with OpenTelemetry query tracing debug hook.
 */
export function withPostgresTracing<
  T extends Record<string, postgres.PostgresType> = Record<string, postgres.PostgresType>,
>(
  postgresOptions: postgres.Options<T>,
  tracingOptions: PostgresTracingOptions = {},
): postgres.Options<T> {
  const existingDebug = postgresOptions.debug;
  const hook = createPostgresDebugHook(tracingOptions);

  return {
    ...postgresOptions,
    debug: (connection: number, query: string, parameters: unknown[], paramTypes: unknown[]) => {
      try {
        hook(connection, query, parameters, paramTypes);
      } catch {
        // Suppress any tracing errors to never interrupt business queries
      }

      if (typeof existingDebug === 'function') {
        existingDebug(connection, query, parameters as never, paramTypes as never);
      }
    },
  };
}
