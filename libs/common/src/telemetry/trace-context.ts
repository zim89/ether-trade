import { context, propagation } from '@opentelemetry/api';

export interface TraceContextCarrier {
  traceparent?: string | null;
  tracestate?: string | null;
}

/**
 * Injects current active OpenTelemetry W3C trace context into carrier fields (traceparent, tracestate).
 * Used when persisting Outbox records to maintain continuous distributed traces.
 */
export function injectCurrentTraceContext(): { traceparent?: string; tracestate?: string } {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);

  return {
    traceparent: carrier['traceparent'],
    tracestate: carrier['tracestate'],
  };
}
