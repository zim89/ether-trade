import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { metrics, NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

let otelSdk: NodeSDK | null = null;
let isInitialized = false;

export interface InitTracerOptions {
  serviceName?: string;
  collectorUrl?: string;
  logLevel?: DiagLogLevel;
}

/**
 * Initializes OpenTelemetry NodeSDK selectively.
 * Supports execution before module imports in dev (initTracer()) and via NODE_OPTIONS in prod.
 * In test environment (NODE_ENV === 'test'), tracing is completely disabled (no-op)
 * to prevent Jest worker hangs and unhandled timer leaks.
 */
export function initTracer(options: InitTracerOptions = {}): NodeSDK | null {
  if (isInitialized) {
    return otelSdk;
  }
  isInitialized = true;

  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  const serviceName =
    options.serviceName ||
    process.env.OTEL_SERVICE_NAME ||
    process.env.APP_NAME ||
    'ether-trade-service';

  const collectorUrl =
    options.collectorUrl || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://127.0.0.1:4317';

  if (options.logLevel !== undefined) {
    diag.setLogger(new DiagConsoleLogger(), options.logLevel);
  }

  const traceExporter = new OTLPTraceExporter({
    url: collectorUrl,
  });

  const metricExporter = new OTLPMetricExporter({
    url: collectorUrl,
  });

  const metricReader = new metrics.PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 15000,
  });

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  });

  otelSdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => {
          // RFC 6455: Exclude ongoing WebSocket streams from keeping HTTP spans open indefinitely
          const upgradeHeader = req.headers['upgrade'];
          return typeof upgradeHeader === 'string' && upgradeHeader.toLowerCase() === 'websocket';
        },
      }),
      new GrpcInstrumentation(),
    ],
  });

  try {
    otelSdk.start();
  } catch (err) {
    // Fail-safe initialization to avoid crashing microservice start

    console.error('Failed to start OpenTelemetry NodeSDK:', err);
  }

  return otelSdk;
}

/**
 * Gracefully shuts down OpenTelemetry SDK, flushing all in-memory spans and metrics.
 */
export async function shutdownTracer(): Promise<void> {
  if (otelSdk) {
    try {
      await otelSdk.shutdown();
    } catch (err) {
      console.error('Error shutting down OpenTelemetry NodeSDK:', err);
    } finally {
      otelSdk = null;
    }
  }
}
